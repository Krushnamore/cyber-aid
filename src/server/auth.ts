import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { findUserById, type UserRow } from './repo';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

export interface AuthUser { id: string; name: string; avatar: string; headline: string; provider: UserRow['provider']; email: string | null }
export const COOKIE = 'cyberaid_token';
const ISSUER = 'cyberaid', AUDIENCE = 'cyberaid-web';
const TTL_SECONDS = Number(process.env['JWT_TTL_SECONDS'] || 7 * 24 * 3600);

/* ------------------------------------------------------------------ secrets */
let secret: Uint8Array | null = null;
function key(): Uint8Array {
  if (secret) return secret;
  let s = process.env['JWT_SECRET'];
  if (!s || s.length < 32) {
    if (process.env['NODE_ENV'] === 'production') throw new Error('JWT_SECRET must be set (>= 32 characters) in production.');
    console.warn('[auth] JWT_SECRET not set (or < 32 chars): using a temporary random secret. Sessions end when the server restarts.');
    s = randomBytes(48).toString('hex');
  }
  return (secret = new TextEncoder().encode(s));
}
export const jwtSecretString = () => Buffer.from(key()).toString('hex');

/* ------------------------------------------------------------------ passwords (scrypt) */
const N = 16384, R = 8, P = 1;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  // always do the same amount of work so response time does not reveal whether an account exists
  const parts = (stored ?? '').split('$');
  const ok = parts.length === 6 && parts[0] === 'scrypt';
  const salt = ok ? Buffer.from(parts[4], 'base64') : Buffer.alloc(16);
  const expected = ok ? Buffer.from(parts[5], 'base64') : Buffer.alloc(64);
  const got = await scrypt(pw, salt, expected.length, { N: ok ? Number(parts[1]) : N, r: ok ? Number(parts[2]) : R, p: ok ? Number(parts[3]) : P });
  return ok && timingSafeEqual(got, expected);
}

/* ------------------------------------------------------------------ JWT */
export async function signToken(u: Pick<UserRow, 'id' | 'name' | 'provider' | 'token_version'>): Promise<string> {
  return new SignJWT({ name: u.name, prov: u.provider, tv: u.token_version })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(u.id).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
}

export function setAuthCookie(req: Request, res: Response, token: string) {
  const secure = req.secure || req.header('x-forwarded-proto') === 'https' || process.env['NODE_ENV'] === 'production';
  res.append('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL_SECONDS}${secure ? '; Secure' : ''}`);
}
export function clearAuthCookie(res: Response) { res.append('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`); }

function cookieOf(req: Request, name: string): string | undefined {
  for (const part of (req.header('cookie') ?? '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return undefined;
}

/** Verifies the JWT (Bearer header or HttpOnly cookie) and loads the user. Never rejects: sets res.locals.user or null. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  res.locals['user'] = null;
  const bearer = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? cookieOf(req, COOKIE);
  if (!token) return next();
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    const row = await findUserById(String(payload.sub));
    if (row && row.token_version === payload['tv']) {
      // cookie sessions need CSRF protection on state-changing requests: require a custom header (forces a CORS preflight)
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (!bearer && unsafe && req.header('x-requested-with') !== 'cyberaid') { res.status(403).json({ error: 'Missing X-Requested-With header' }); return; }
      res.locals['user'] = { id: row.id, name: row.name, avatar: row.avatar, headline: row.headline, provider: row.provider, email: row.email } satisfies AuthUser;
    }
  } catch { /* expired / invalid token: treated as signed out */ }
  next();
}

export const userOf = (res: Response): AuthUser | null => res.locals['user'] ?? null;

export function requireUser(_req: Request, res: Response, next: NextFunction) {
  if (!userOf(res)) { res.status(401).json({ error: 'Sign in required' }); return; }
  next();
}

/** In-memory sliding window limiter. keyFn defaults to user id or IP. */
export function rateLimit(max: number, windowMs = 60_000, keyFn?: (req: Request, res: Response) => string) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (keyFn ? keyFn(req, res) : (userOf(res)?.id ?? req.ip ?? 'anon')) + '|' + req.path;
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { res.status(429).json({ error: 'Too many requests, slow down.' }); return; }
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
