import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { COOKIE, clearAuthCookie, hashPassword, jwtSecretString, rateLimit, setAuthCookie, signToken, userOf, verifyPassword } from './auth';
import { MailError, sendOtpEmail } from './mailer';
import * as repo from './repo';

export const authApi = Router();

const OTP_TTL_MIN = 10, OTP_MAX_ATTEMPTS = 5, RESEND_COOLDOWN_S = 60, MAX_SENDS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

class HttpError extends Error { constructor(public status: number, msg: string, public extra: object = {}) { super(msg); } }
const fail = (res: Response, e: unknown) => {
  if (e instanceof HttpError) { res.status(e.status).json({ error: e.message, ...e.extra }); return; }
  if (e instanceof MailError) { res.status(e.status).json({ error: e.message }); return; }
  console.error('[auth]', e);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => fn(req, res).catch((e) => fail(res, e));

const email = (v: unknown): string => {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(e) || e.length > 254) throw new HttpError(400, 'Enter a valid e-mail address.');
  return e;
};
const cleanName = (v: unknown): string => {
  const n = (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 60) throw new HttpError(400, 'Name must be 2-60 characters.');
  return n;
};
const checkPassword = (pw: unknown, mail: string): string => {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (pw.length > 128) throw new HttpError(400, 'Password is too long.');
  if (pw.toLowerCase() === mail || /^(password|12345678|qwertyui)/i.test(pw)) throw new HttpError(400, 'Choose a less guessable password.');
  return pw;
};

const dto = (u: repo.UserRow) => ({ id: u.id, email: u.email, name: u.name, avatar: u.avatar, headline: u.headline, provider: u.provider });
const avatarFor = (seed: string) => `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;

async function session(req: Request, res: Response, u: repo.UserRow) {
  const token = await signToken(u);
  setAuthCookie(req, res, token);
  await repo.touchLogin(u.id);
  res.json({ user: dto(u), token });
}

/* ------------------------------------------------------------------ OTP */
const otpHash = (mail: string, code: string) => createHmac('sha256', jwtSecretString()).update(`${mail}:${code}`).digest('hex');

async function issueOtp(mail: string, purpose: 'verify_email' | 'reset_password', name: string) {
  const last = await repo.latestOtp(mail, purpose);
  if (last) {
    const wait = RESEND_COOLDOWN_S - Math.floor((Date.now() - new Date(last.created_at).getTime()) / 1000);
    if (wait > 0) throw new HttpError(429, `Please wait ${wait}s before requesting another code.`, { retryAfter: wait });
  }
  if ((await repo.otpsSentSince(mail, new Date(Date.now() - 3600_000))) >= MAX_SENDS_PER_HOUR) throw new HttpError(429, 'Too many codes requested. Try again in an hour.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await repo.saveOtp(mail, purpose, otpHash(mail, code), new Date(Date.now() + OTP_TTL_MIN * 60_000));
  try {
    const r = await sendOtpEmail(mail, code, purpose, name, OTP_TTL_MIN);
    await repo.noteOtpSend(mail);
    return { devCode: r.devCode, delivered: r.delivered };
  } catch (e) { await repo.deleteOtps(mail, purpose); throw e; }
}

async function checkOtp(mail: string, purpose: 'verify_email' | 'reset_password', code: unknown) {
  const c = typeof code === 'string' ? code.trim() : '';
  if (!/^\d{6}$/.test(c)) throw new HttpError(400, 'Enter the 6-digit code.');
  const row = await repo.latestOtp(mail, purpose);
  if (!row) throw new HttpError(400, 'No active code. Request a new one.');
  if (new Date(row.expires_at).getTime() < Date.now()) { await repo.deleteOtps(mail, purpose); throw new HttpError(400, 'This code has expired. Request a new one.'); }
  if (row.attempts >= OTP_MAX_ATTEMPTS) { await repo.deleteOtps(mail, purpose); throw new HttpError(429, 'Too many wrong attempts. Request a new code.'); }
  const good = timingSafeEqual(Buffer.from(otpHash(mail, c), 'hex'), Buffer.from(row.code_hash, 'hex'));
  if (!good) { await repo.bumpOtpAttempts(row.id); throw new HttpError(400, `Incorrect code. ${OTP_MAX_ATTEMPTS - row.attempts - 1} attempt(s) left.`); }
  await repo.deleteOtps(mail, purpose);
}

const byIp = rateLimit(30, 60_000);
const byEmail = (max: number, windowMs: number) => rateLimit(max, windowMs, (req) => String((req.body as { email?: string })?.email ?? '').toLowerCase().slice(0, 254) || (req.ip ?? 'anon'));

/* ------------------------------------------------------------------ routes */
authApi.post('/register', byIp, byEmail(8, 3600_000), wrap(async (req, res) => {
  const mail = email(req.body?.email), name = cleanName(req.body?.name), pw = checkPassword(req.body?.password, mail);
  const existing = await repo.findUserByEmail(mail);
  if (existing?.email_verified) throw new HttpError(409, 'An account with this e-mail already exists. Sign in instead.');
  const hash = await hashPassword(pw);
  if (existing) await repo.updateUnverifiedSignup(existing.id, name, hash);
  else await repo.createUser({ id: randomUUID(), email: mail, name, passwordHash: hash, provider: 'password', verified: false, avatar: avatarFor(mail) });
  const otp = await issueOtp(mail, 'verify_email', name);
  res.status(201).json({ needsVerification: true, email: mail, resendIn: RESEND_COOLDOWN_S, expiresInMinutes: OTP_TTL_MIN, devCode: otp.devCode });
}));

authApi.post('/verify-otp', byIp, byEmail(20, 3600_000), wrap(async (req, res) => {
  const mail = email(req.body?.email);
  const user = await repo.findUserByEmail(mail);
  if (!user) throw new HttpError(400, 'No active code. Request a new one.');
  await checkOtp(mail, 'verify_email', req.body?.code);
  await repo.markVerified(user.id);
  await session(req, res, { ...user, email_verified: 1 });
}));

authApi.post('/resend-otp', byIp, byEmail(10, 3600_000), wrap(async (req, res) => {
  const mail = email(req.body?.email);
  const purpose = req.body?.purpose === 'reset_password' ? 'reset_password' : 'verify_email';
  const user = await repo.findUserByEmail(mail);
  // generic reply for unknown / already-verified accounts so the endpoint cannot be used to enumerate users
  if (user && ((purpose === 'verify_email' && !user.email_verified) || (purpose === 'reset_password' && user.provider === 'password'))) {
    const otp = await issueOtp(mail, purpose, user.name);
    res.json({ ok: true, resendIn: RESEND_COOLDOWN_S, devCode: otp.devCode }); return;
  }
  res.json({ ok: true, resendIn: RESEND_COOLDOWN_S });
}));

authApi.post('/login', byIp, byEmail(10, 15 * 60_000), wrap(async (req, res) => {
  const mail = email(req.body?.email);
  const pw = typeof req.body?.password === 'string' ? req.body.password.slice(0, 128) : '';
  const user = await repo.findUserByEmail(mail);
  const ok = await verifyPassword(pw, user?.password_hash ?? null);
  if (!user || !ok) throw new HttpError(401, 'Wrong e-mail or password.');
  if (!user.email_verified) {
    let dev: string | undefined;
    try { dev = (await issueOtp(mail, 'verify_email', user.name)).devCode; } catch (e) { if (!(e instanceof HttpError && e.status === 429)) throw e; }
    res.status(403).json({ error: 'Verify your e-mail to continue. We sent you a code.', needsVerification: true, email: mail, resendIn: RESEND_COOLDOWN_S, devCode: dev }); return;
  }
  await session(req, res, user);
}));

authApi.post('/forgot-password', byIp, byEmail(5, 3600_000), wrap(async (req, res) => {
  const mail = email(req.body?.email);
  const user = await repo.findUserByEmail(mail);
  let dev: string | undefined;
  if (user && user.provider === 'password') { try { dev = (await issueOtp(mail, 'reset_password', user.name)).devCode; } catch (e) { if (!(e instanceof HttpError && e.status === 429)) throw e; } }
  res.json({ ok: true, message: 'If an account exists for this e-mail, a code has been sent.', resendIn: RESEND_COOLDOWN_S, devCode: dev });
}));

authApi.post('/reset-password', byIp, byEmail(10, 3600_000), wrap(async (req, res) => {
  const mail = email(req.body?.email);
  const user = await repo.findUserByEmail(mail);
  if (!user || user.provider !== 'password') throw new HttpError(400, 'No active code. Request a new one.');
  const pw = checkPassword(req.body?.newPassword, mail);
  await checkOtp(mail, 'reset_password', req.body?.code);
  await repo.setPassword(user.id, await hashPassword(pw)); // also invalidates every older session
  const fresh = (await repo.findUserById(user.id))!;
  await session(req, res, fresh);
}));

/** Exchange a Google (Firebase) ID token for our own JWT. The Google account's e-mail must be verified by Google. */
const FB_PROJECT = process.env['FIREBASE_PROJECT_ID'] || 'gen-lang-client-0477356472';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
authApi.post('/google', byIp, wrap(async (req, res) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
  let p;
  try { p = (await jwtVerify(idToken, JWKS, { issuer: `https://securetoken.google.com/${FB_PROJECT}`, audience: FB_PROJECT })).payload; }
  catch { throw new HttpError(401, 'Google sign-in could not be verified.'); }
  const mail = String(p['email'] ?? '').toLowerCase();
  if (!mail || p['email_verified'] !== true) throw new HttpError(401, 'Your Google e-mail is not verified.');
  const name = String(p['name'] ?? mail.split('@')[0]).slice(0, 60);
  const avatar = String(p['picture'] ?? avatarFor(mail)).slice(0, 500);
  let user = await repo.findUserByEmail(mail);
  if (!user) { await repo.createUser({ id: randomUUID(), email: mail, name, passwordHash: null, provider: 'google', verified: true, avatar }); user = (await repo.findUserByEmail(mail))!; }
  else await repo.linkGoogle(user.id, user.provider === 'password' ? user.name : name, avatar);
  await session(req, res, (await repo.findUserByEmail(mail))!);
}));

/** Guest account for demos. Disabled in production unless ALLOW_DEMO_AUTH=true. */
authApi.post('/demo', byIp, rateLimit(Number(process.env['DEMO_RATE_LIMIT'] || 10), 60_000), wrap(async (req, res) => {
  const allowed = process.env['ALLOW_DEMO_AUTH'] ? process.env['ALLOW_DEMO_AUTH'] === 'true' : process.env['NODE_ENV'] !== 'production';
  if (!allowed) throw new HttpError(403, 'Guest access is disabled on this server.');
  const id = randomUUID();
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? cleanName(req.body.name) : `Guest ${id.slice(0, 4)}`;
  await repo.createUser({ id, email: null, name, passwordHash: null, provider: 'demo', verified: true, avatar: avatarFor(id), headline: 'Guest account' });
  await session(req, res, (await repo.findUserById(id))!);
}));

authApi.get('/me', (_req, res) => { const u = userOf(res); res.json({ user: u ? { id: u.id, email: u.email, name: u.name, avatar: u.avatar, headline: u.headline, provider: u.provider } : null }); });

authApi.post('/logout', (_req, res) => { clearAuthCookie(res); res.json({ ok: true }); });

export { COOKIE };
