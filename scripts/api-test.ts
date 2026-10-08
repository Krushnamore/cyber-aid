import http from 'node:http';
import { TEST_DB_URL, freshDb } from './_db';
import express from 'express';

// ---- mock Resend (captures e-mails) --------------------------------------------------
const mails: { to: string; subject: string; text: string; auth?: string; from: string }[] = [];
const resend = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c));
  req.on('end', () => { const j = JSON.parse(b); mails.push({ to: j.to[0], subject: j.subject, text: j.text, auth: req.headers.authorization, from: j.from }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'mock' })); });
});
const lastCode = (to: string) => { const m = [...mails].reverse().find((x) => x.to === to); return m ? /Your code: (\d{6})/.exec(m.text)?.[1] ?? '' : ''; };

let fails = 0; const ok = (c: boolean, m: string) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };

resend.listen(0, async () => {
  process.env['RESEND_API_KEY'] = 're_test_key';
  process.env['RESEND_BASE_URL'] = `http://localhost:${(resend.address() as { port: number }).port}`;
  process.env['RESEND_FROM'] = 'CyberAid <no-reply@test.dev>';
  await freshDb();
  const { api } = await import('../src/server/routes');
  const { exec, q, closeDb } = await import('../src/server/db');
  const app = express(); app.use(express.json({ limit: '2mb' })); app.set('trust proxy', 1); app.use('/api', api);
  const srv = app.listen(0);
  const base = `http://localhost:${(srv.address() as { port: number }).port}/api`;

  const call = async (m: string, p: string, body?: unknown, o: { token?: string; cookie?: string; csrf?: boolean } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (o.token) headers['authorization'] = `Bearer ${o.token}`;
    if (o.cookie) headers['cookie'] = o.cookie;
    if (o.csrf) headers['x-requested-with'] = 'cyberaid';
    const r = await fetch(base + p, { method: m, headers, body: body ? JSON.stringify(body) : undefined });
    return { s: r.status, j: (await r.json().catch(() => null)) as any, setCookie: r.headers.get('set-cookie') ?? '' };
  };
  const guests = new Map<string, string>();
  const as = async (name: string) => { if (!guests.has(name)) guests.set(name, (await call('POST', '/auth/demo', { name })).j.token); return guests.get(name)!; };

  // ================= database =================
  const tables = (await q("SELECT table_name t FROM information_schema.tables WHERE table_schema=DATABASE()")).map((r) => String(r['t'] ?? r['TABLE_NAME']).toLowerCase());
  ok(['users', 'otp_codes', 'posts', 'post_likes', 'comments', 'entity_reports', 'blocklist', 'scans', 'quiz_scores', 'kv'].every((t) => tables.includes(t)), 'MySQL schema created (10 tables)');
  let r = await call('GET', '/health'); ok(r.j.db === true, 'health reports db up');

  // ================= register + e-mail OTP =================
  const E = 'priya@example.com';
  r = await call('POST', '/auth/register', { name: 'Priya Sharma', email: E, password: 'S3cure-pass!' });
  ok(r.s === 201 && r.j.needsVerification && !r.j.devCode, 'register -> needs verification, code NOT leaked in response');
  ok(mails.length === 1 && mails[0].to === E && mails[0].auth === 'Bearer re_test_key' && mails[0].from.includes('no-reply@test.dev'), 'OTP e-mail sent through Resend with API key + from');
  ok(/^\d{6}$/.test(lastCode(E)) && mails[0].subject.includes(lastCode(E)), 'e-mail contains 6-digit code');
  const u = (await q("SELECT password_hash, email_verified FROM users WHERE email=?", [E]))[0];
  ok(String(u['password_hash']).startsWith('scrypt$') && !String(u['password_hash']).includes('S3cure'), 'password stored as scrypt hash');
  const otpRow = (await q('SELECT code_hash FROM otp_codes WHERE email=?', [E]))[0];
  ok(otpRow['code_hash'] !== lastCode(E) && String(otpRow['code_hash']).length === 64, 'OTP stored hashed (HMAC), not plain');
  r = await call('POST', '/auth/login', { email: E, password: 'S3cure-pass!' });
  ok(r.s === 403 && r.j.needsVerification, 'login before verifying is blocked');
  r = await call('POST', '/auth/register', { name: 'x', email: 'bad', password: 'S3cure-pass!' }); ok(r.s === 400, 'invalid e-mail/name rejected');
  r = await call('POST', '/auth/register', { name: 'Priya', email: 'weak@example.com', password: 'abc' }); ok(r.s === 400, 'weak password rejected');
  r = await call('POST', '/auth/resend-otp', { email: E }); ok(r.s === 429 && r.j.retryAfter > 0, 'resend cooldown enforced (60s)');
  const good = lastCode(E), bad = good === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 2; i++) { r = await call('POST', '/auth/verify-otp', { email: E, code: bad }); ok(r.s === 400 && /Incorrect/.test(r.j.error), `wrong code #${i} rejected (${r.j.error})`); }
  r = await call('POST', '/auth/verify-otp', { email: E, code: good });
  ok(r.s === 200 && r.j.token && r.j.user.email === E && /HttpOnly/.test(r.setCookie) && /SameSite=Lax/.test(r.setCookie), 'correct code -> JWT + HttpOnly SameSite cookie');
  const jwt = r.j.token as string, cookie = r.setCookie.split(';')[0];
  ok(jwt.split('.').length === 3, 'token is a JWT (3 parts)');
  ok((await q('SELECT COUNT(*) c FROM otp_codes WHERE email=?', [E]))[0]['c'] == 0, 'used OTP deleted (single use)');
  r = await call('POST', '/auth/verify-otp', { email: E, code: good }); ok(r.s === 400, 'OTP cannot be replayed');
  r = await call('GET', '/auth/me', undefined, { token: jwt }); ok(r.j.user?.email === E && r.j.user.name === 'Priya Sharma', 'GET /auth/me with Bearer');
  r = await call('GET', '/auth/me', undefined, { cookie }); ok(r.j.user?.email === E, 'GET /auth/me with cookie');
  r = await call('GET', '/auth/me'); ok(r.j.user === null, 'no token -> signed out');
  r = await call('GET', '/auth/me', undefined, { token: jwt.slice(0, -3) + 'abc' }); ok(r.j.user === null, 'tampered JWT rejected');
  r = await call('POST', '/community/posts', { content: 'cookie post without csrf header' }, { cookie }); ok(r.s === 403, 'cookie POST without X-Requested-With blocked (CSRF)');
  r = await call('POST', '/community/posts', { content: 'cookie post with csrf header' }, { cookie, csrf: true }); ok(r.s === 201, 'cookie POST with header allowed');
  r = await call('POST', '/auth/register', { name: 'Priya', email: E, password: 'Another-pass1' }); ok(r.s === 409, 'duplicate verified e-mail -> 409');
  r = await call('POST', '/auth/login', { email: E, password: 'wrong-password' }); ok(r.s === 401, 'wrong password -> 401');
  r = await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'whatever123' }); ok(r.s === 401 && r.j.error === 'Wrong e-mail or password.', 'unknown e-mail gives same error (no enumeration)');
  r = await call('POST', '/auth/login', { email: E, password: 'S3cure-pass!' }); ok(r.s === 200 && r.j.token, 'login after verification works');

  // ================= OTP expiry + attempt limit =================
  const E2 = 'amit@example.com';
  await call('POST', '/auth/register', { name: 'Amit Rao', email: E2, password: 'S3cure-pass!' });
  await exec("UPDATE otp_codes SET expires_at=? WHERE email=?", [new Date(Date.now() - 1000), E2]);
  r = await call('POST', '/auth/verify-otp', { email: E2, code: lastCode(E2) }); ok(r.s === 400 && /expired/.test(r.j.error), 'expired OTP rejected');
  await exec("UPDATE otp_codes SET created_at=? WHERE email=?", [new Date(Date.now() - 120_000), E2]); // skip cooldown
  r = await call('POST', '/auth/register', { name: 'Amit Rao', email: E2, password: 'S3cure-pass!' }); ok(r.s === 201, 'unverified sign-up can be retried (new OTP)');
  const c2 = lastCode(E2), wrong = c2 === '123456' ? '654321' : '123456';
  let last: any; for (let i = 0; i < 5; i++) last = await call('POST', '/auth/verify-otp', { email: E2, code: wrong });
  ok(last.s === 400 || last.s === 429, '5 wrong attempts consumed');
  r = await call('POST', '/auth/verify-otp', { email: E2, code: c2 }); ok(r.s === 429 || r.s === 400, `correct code refused after too many attempts (${r.j.error})`);

  // ================= forgot / reset password =================
  r = await call('POST', '/auth/forgot-password', { email: 'ghost@example.com' }); ok(r.s === 200 && !mails.some((m) => m.to === 'ghost@example.com'), 'forgot-password for unknown e-mail: generic reply, no mail sent');
  r = await call('POST', '/auth/forgot-password', { email: E }); ok(r.s === 200, 'forgot-password for real user');
  const rc = lastCode(E);
  r = await call('POST', '/auth/reset-password', { email: E, code: rc, newPassword: 'short' }); ok(r.s === 400, 'reset with weak password refused');
  r = await call('POST', '/auth/reset-password', { email: E, code: rc, newPassword: 'Brand-new-pass9' });
  ok(r.s === 200 && r.j.token, 'reset-password with OTP succeeds and signs in');
  r = await call('GET', '/auth/me', undefined, { token: jwt }); ok(r.j.user === null, 'old JWT invalidated after password reset (token_version)');
  r = await call('POST', '/auth/login', { email: E, password: 'S3cure-pass!' }); ok(r.s === 401, 'old password no longer works');
  r = await call('POST', '/auth/login', { email: E, password: 'Brand-new-pass9' }); ok(r.s === 200, 'new password works');

  // ================= google exchange, guest, logout =================
  r = await call('POST', '/auth/google', { idToken: 'not-a-token' }); ok(r.s === 401, 'invalid Google token rejected');
  r = await call('POST', '/auth/demo', { name: 'Guest One' }); ok(r.s === 200 && r.j.user.provider === 'demo', 'guest account');
  r = await call('POST', '/auth/logout'); ok(/Max-Age=0/.test(r.setCookie), 'logout clears cookie');

  // ================= scanning + reports (MySQL) =================
  r = await call('POST', '/scan', { input: 'http://newbank-login.top/verify' }); ok(r.s === 200 && r.j.verdict === 'high', `scan url high (${r.j.score})`);
  const dom = 'https://smallshop-kolhapur.in';
  const a = (await call('POST', '/scan', { input: dom })).j.score;
  for (const n of ['u1', 'u2', 'u3', 'u4', 'u5']) await call('POST', '/reports', { kind: 'url', value: dom }, { token: await as(n) });
  const b = await call('POST', '/scan', { input: dom });
  ok(b.j.communityReports === 5 && b.j.score > a && b.j.verdict === 'high', `5 reports raise ${a} -> ${b.j.score}`);
  r = await call('POST', '/reports', { kind: 'url', value: dom }, { token: await as('u1') }); ok(r.j.duplicate === true, 'duplicate report ignored (UNIQUE key)');
  r = await call('POST', '/reports', { kind: 'url', value: dom }); ok(r.s === 401, 'report requires sign-in');
  await call('POST', '/blocklist', { kind: 'phone', value: '+91 98765 43210' }, { token: await as('u9') });
  r = await call('POST', '/scan', { input: '+91 98765 43210', mode: 'phone' }, { token: await as('u9') }); ok(r.j.blocked && r.j.verdict === 'high', 'blocklisted phone flagged for that user');
  r = await call('POST', '/scan', { input: '+91 98765 43210', mode: 'phone' }, { token: await as('u8') }); ok(!r.j.blocked, 'blocklist is per-user');
  const samples = (await call('GET', '/samples/emails')).j.samples;
  for (const s of samples) { const e = (await call('POST', '/scan/email', { raw: s.raw, deep: false })).j.report; ok(s.id.includes('legit') ? e.verdict === 'LOW' : e.verdict === 'HIGH', `email ${s.id} -> ${e.verdict} ${e.threatScore}`); }
  r = await call('POST', '/scan/email-batch', { emails: [{ id: 'm1', from: 'Amazon <offers@amaz0n-gifts.top>', subject: 'You won a free prize, claim now', snippet: 'Click http://amaz0n-gifts.top/claim and share your OTP' }, { id: 'm2', from: 'Priya <priya@gmail.com>', subject: 'Lunch tomorrow?', snippet: 'Are we meeting at 1 pm?' }] });
  ok(r.j.items[0].verdict !== 'LOW' && r.j.items[1].verdict === 'LOW', 'email batch');

  // ================= community (MySQL) =================
  const alice = await as('alice'), bob = await as('bob');
  r = await call('GET', '/community/posts', undefined, { token: alice }); ok(r.j.posts.length >= 3 && r.j.posts.some((p: any) => p.id === 'seed-1'), 'seed posts loaded into MySQL');
  r = await call('POST', '/community/posts', { content: 'Got a fake KYC SMS today, be careful! 🙏 ₹5,000 asked', tags: ['#KYC', 'bad tag'] }, { token: alice }); const id = r.j.post.id;
  ok(r.s === 201 && r.j.post.tags.length === 1 && r.j.post.mine && r.j.post.content.includes('🙏'), 'create post (utf8mb4 emoji + ₹ preserved)');
  r = await call('POST', '/community/posts', { content: 'xxxxx', mediaType: 'image', mediaUrl: 'javascript:alert(1)' }, { token: alice }); ok(r.s === 400, 'javascript: media url rejected');
  await call('POST', `/community/posts/${id}/like`, undefined, { token: alice }); r = await call('POST', `/community/posts/${id}/like`, undefined, { token: bob }); ok(r.j.likes === 2 && r.j.likedByMe, 'likes are per user');
  r = await call('POST', `/community/posts/${id}/like`, undefined, { token: bob }); ok(r.j.likes === 1 && !r.j.likedByMe, 'unlike');
  r = await call('POST', `/community/posts/${id}/comments`, { text: 'Thanks for sharing' }, { token: bob }); ok(r.s === 201, 'comment');
  r = await call('GET', '/community/posts', undefined, { token: bob }); const pp = r.j.posts.find((p: any) => p.id === id); ok(pp.comments.length === 1 && pp.likes === 1 && !pp.likedByMe && !pp.mine, 'feed reflects likes/comments per viewer');
  r = await call('DELETE', `/community/posts/${id}`, undefined, { token: bob }); ok(r.s === 403, "cannot delete others' posts");
  r = await call('DELETE', `/community/posts/${id}`, undefined, { token: alice }); ok(r.s === 200, 'owner deletes');
  ok((await q('SELECT COUNT(*) c FROM comments WHERE post_id=?', [id]))[0]['c'] == 0, 'comments/likes cascade-deleted');

  // ================= quiz, analytics, assistant =================
  const qs = (await call('GET', '/quiz/start?count=5')).j; ok(qs.questions.length === 5 && !JSON.stringify(qs).includes('explanation'), 'quiz start hides answers');
  const sub = await call('POST', '/quiz/submit', { sessionId: qs.sessionId, answers: {} }, { token: await as('quizzer') }); ok(sub.j.total === 5 && sub.j.saved === true, 'quiz graded + saved');
  r = await call('POST', '/quiz/submit', { sessionId: qs.sessionId, answers: {} }); ok(r.s === 404, 'cannot resubmit a session');
  r = await call('GET', '/quiz/leaderboard'); ok(r.j.top.length >= 1, 'leaderboard from SQL');
  r = await call('GET', '/analytics'); ok(r.j.platform.totalScans > 5 && r.j.platform.daily.length === 14 && r.j.platform.topReported.length >= 1 && r.j.national.years[3].complaints === 2268346, `analytics from SQL (${r.j.platform.totalScans} scans, top reported ${r.j.platform.topReported[0]?.value})`);
  r = await call('POST', '/assistant/chat', { messages: [{ role: 'user', text: 'I shared my UPI PIN with a caller' }] }); ok(r.j.source === 'playbook' && r.j.reply.includes('1930'), 'assistant playbook fallback (no key)');
  r = await call('GET', '/ml/models'); ok(r.j.models.length === 2, 'model cards');

  console.log(fails ? `\n${fails} FAILED` : `\nALL API TESTS PASSED  (db: ${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})`);
  srv.close(); resend.close(); await closeDb(); process.exit(fails ? 1 : 0);
});
