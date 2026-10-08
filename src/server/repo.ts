import type { RowDataPacket } from 'mysql2/promise';
import type { ScanKind } from '../shared/api-types';
import { exec, q } from './db';
import { normalizeUrl, registeredDomain, splitHostPath } from './ml/url-classifier';

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : '');

/* ================================================================ users */
export interface UserRow {
  id: string; email: string | null; name: string; password_hash: string | null; email_verified: number;
  provider: 'password' | 'google' | 'demo'; avatar: string; headline: string; token_version: number;
}
const USER_COLS = 'id,email,name,password_hash,email_verified,provider,avatar,headline,token_version';

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return ((await q<RowDataPacket>(`SELECT ${USER_COLS} FROM users WHERE email=? LIMIT 1`, [email]))[0] as UserRow) ?? null;
}
export async function findUserById(id: string): Promise<UserRow | null> {
  return ((await q<RowDataPacket>(`SELECT ${USER_COLS} FROM users WHERE id=? LIMIT 1`, [id]))[0] as UserRow) ?? null;
}
export async function createUser(u: { id: string; email: string | null; name: string; passwordHash: string | null; provider: UserRow['provider']; verified: boolean; avatar: string; headline?: string }) {
  await exec(
    'INSERT INTO users (id,email,name,password_hash,email_verified,provider,avatar,headline,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [u.id, u.email, u.name, u.passwordHash, u.verified ? 1 : 0, u.provider, u.avatar, u.headline ?? 'CyberAid community member', new Date()],
  );
}
export async function updateUnverifiedSignup(id: string, name: string, passwordHash: string) {
  await exec('UPDATE users SET name=?, password_hash=? WHERE id=? AND email_verified=0', [name, passwordHash, id]);
}
export async function markVerified(id: string) { await exec('UPDATE users SET email_verified=1, last_login_at=? WHERE id=?', [new Date(), id]); }
export async function touchLogin(id: string) { await exec('UPDATE users SET last_login_at=? WHERE id=?', [new Date(), id]); }
/** Changing the password bumps token_version, which invalidates every JWT issued before. */
export async function setPassword(id: string, hash: string) { await exec('UPDATE users SET password_hash=?, email_verified=1, token_version=token_version+1 WHERE id=?', [hash, id]); }
export async function linkGoogle(id: string, name: string, avatar: string) { await exec("UPDATE users SET email_verified=1, provider=IF(provider='demo','google',provider), name=?, avatar=?, last_login_at=? WHERE id=?", [name, avatar, new Date(), id]); }

/* ================================================================ otp */
export interface OtpRow { id: number; code_hash: string; expires_at: Date; attempts: number; created_at: Date }
export async function saveOtp(email: string, purpose: 'verify_email' | 'reset_password', hash: string, expires: Date) {
  await exec('DELETE FROM otp_codes WHERE email=? AND purpose=?', [email, purpose]);
  await exec('INSERT INTO otp_codes (email,purpose,code_hash,expires_at,created_at) VALUES (?,?,?,?,?)', [email, purpose, hash, expires, new Date()]);
}
export async function latestOtp(email: string, purpose: string): Promise<OtpRow | null> {
  return ((await q<RowDataPacket>('SELECT id,code_hash,expires_at,attempts,created_at FROM otp_codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1', [email, purpose]))[0] as OtpRow) ?? null;
}
export async function bumpOtpAttempts(id: number) { await exec('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', [id]); }
export async function deleteOtps(email: string, purpose?: string) {
  if (purpose) await exec('DELETE FROM otp_codes WHERE email=? AND purpose=?', [email, purpose]); else await exec('DELETE FROM otp_codes WHERE email=?', [email]);
}
export async function otpsSentSince(email: string, since: Date): Promise<number> {
  // otp rows are replaced on each send, so count recent sends via a lightweight kv counter
  const r = await q<RowDataPacket>('SELECT v FROM kv WHERE k=?', [`otp-sends:${email}`]);
  if (!r[0]) return 0;
  const arr: number[] = JSON.parse(r[0]['v']);
  return arr.filter((t) => t > since.getTime()).length;
}
export async function noteOtpSend(email: string) {
  const r = await q<RowDataPacket>('SELECT v FROM kv WHERE k=?', [`otp-sends:${email}`]);
  const arr: number[] = r[0] ? JSON.parse(r[0]['v']) : [];
  const keep = [...arr.filter((t) => Date.now() - t < 3600_000), Date.now()];
  await kvSet(`otp-sends:${email}`, JSON.stringify(keep));
}

/* ================================================================ kv */
export async function kvGet(k: string): Promise<string | null> { const r = await q<RowDataPacket>('SELECT v FROM kv WHERE k=?', [k]); return r[0] ? (r[0]['v'] as string) : null; }
export async function kvSet(k: string, v: string) { await exec('INSERT INTO kv (k,v,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v), updated_at=VALUES(updated_at)', [k, v, new Date()]); }

/* ================================================================ reports / blocklist / scans */
/** Canonical key used for community reports and blocklists. */
export function entityKey(kind: ScanKind, value: string): string {
  const v = value.trim().toLowerCase();
  if (kind === 'upi') return `upi:${v}`;
  if (kind === 'phone') return `phone:${v.replace(/\D/g, '').slice(-10)}`;
  if (kind === 'url' || kind === 'qr') { const { host } = splitHostPath(normalizeUrl(v)); return `domain:${registeredDomain(host)}`; }
  return `${kind}:${v.slice(0, 120)}`;
}
export async function countReports(key: string): Promise<number> {
  return Number((await q<RowDataPacket>('SELECT COUNT(DISTINCT reporter_id) c FROM entity_reports WHERE entity_key=?', [key]))[0]['c']);
}
/** returns false if this user already reported the entity */
export async function addReport(r: { id: string; key: string; kind: ScanKind; value: string; note?: string; reporterId: string }): Promise<boolean> {
  const res = await exec('INSERT IGNORE INTO entity_reports (id,entity_key,kind,value,note,reporter_id,created_at) VALUES (?,?,?,?,?,?,?)', [r.id, r.key, r.kind, r.value, r.note ?? null, r.reporterId, new Date()]);
  return res.affectedRows === 1;
}
export async function isBlocked(userId: string, key: string): Promise<boolean> {
  return (await q('SELECT 1 FROM blocklist WHERE user_id=? AND entity_key=? LIMIT 1', [userId, key])).length > 0;
}
export async function addBlock(userId: string, key: string, kind: ScanKind, value: string) {
  await exec('INSERT IGNORE INTO blocklist (user_id,entity_key,kind,value,created_at) VALUES (?,?,?,?,?)', [userId, key, kind, value, new Date()]);
}
export async function removeBlock(userId: string, key: string) { await exec('DELETE FROM blocklist WHERE user_id=? AND entity_key=?', [userId, key]); }
export async function listBlocks(userId: string) {
  return (await q<RowDataPacket>('SELECT entity_key `key`, kind, value, created_at FROM blocklist WHERE user_id=? ORDER BY created_at DESC', [userId])).map((r) => ({ key: r['key'], kind: r['kind'], value: r['value'], createdAt: iso(r['created_at']) }));
}
export async function addScan(s: { id: string; ts: string; kind: string; verdict: string; score: number; userId: string | null }) {
  await exec('INSERT IGNORE INTO scans (id,ts,kind,verdict,score,user_id) VALUES (?,?,?,?,?,?)', [s.id, new Date(s.ts), s.kind, s.verdict, s.score, s.userId]);
}

export async function platformStats() {
  const byVerdict: Record<string, number> = { safe: 0, suspicious: 0, high: 0 };
  for (const r of await q<RowDataPacket>('SELECT verdict, COUNT(*) c FROM scans GROUP BY verdict')) byVerdict[r['verdict']] = Number(r['c']);
  const byKind: Record<string, number> = {};
  for (const r of await q<RowDataPacket>('SELECT kind, COUNT(*) c FROM scans GROUP BY kind')) byKind[r['kind']] = Number(r['c']);
  const since = new Date(Date.now() - 14 * 86400000); since.setUTCHours(0, 0, 0, 0);
  const dayRows = await q<RowDataPacket>("SELECT DATE_FORMAT(ts,'%Y-%m-%d') d, COUNT(*) total, SUM(verdict<>'safe') threats FROM scans WHERE ts>=? GROUP BY d", [since]);
  const byDay = new Map(dayRows.map((r) => [r['d'] as string, r]));
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    return { date: d, total: Number(r?.['total'] ?? 0), threats: Number(r?.['threats'] ?? 0) };
  });
  const totalScans = Object.values(byVerdict).reduce((a, b) => a + b, 0);
  const rep = (await q<RowDataPacket>('SELECT COUNT(*) c, COUNT(DISTINCT entity_key) u FROM entity_reports'))[0];
  const top = (await q<RowDataPacket>('SELECT entity_key k, MAX(kind) kind, MAX(value) value, COUNT(DISTINCT reporter_id) n FROM entity_reports GROUP BY entity_key ORDER BY n DESC LIMIT 8')).map((r) => ({
    kind: r['kind'] as string,
    value: (r['k'] as string).startsWith('domain:') ? (r['k'] as string).slice(7) : r['kind'] === 'upi' ? String(r['value']).replace(/^(.{2}).*(@.*)$/, '$1***$2') : String(r['value']).replace(/\d(?=\d{3})/g, '•'),
    reports: Number(r['n']),
  }));
  const posts = Number((await q<RowDataPacket>('SELECT COUNT(*) c FROM posts'))[0]['c']);
  return { totalScans, byVerdict, byKind, daily, totalReports: Number(rep['c']), uniqueReportedEntities: Number(rep['u']), communityPosts: posts, topReported: top };
}

/* ================================================================ community */
export interface PostOut {
  id: string; authorId: string; authorName: string; authorHeadline: string; authorAvatar: string; verified: boolean; createdAt: string; content: string;
  mediaType?: 'image' | 'video'; mediaUrl?: string; videoTitle?: string; tags: string[]; likes: number; likedByMe: boolean;
  comments: { id: string; authorId: string; author: string; avatar: string; text: string; createdAt: string }[]; mine: boolean;
}

export async function listPosts(uid: string | null): Promise<PostOut[]> {
  const posts = await q<RowDataPacket>('SELECT * FROM posts ORDER BY created_at DESC LIMIT 200');
  if (!posts.length) return [];
  const ids = posts.map((p) => p['id'] as string);
  const likes = new Map((await q<RowDataPacket>('SELECT post_id, COUNT(*) c FROM post_likes WHERE post_id IN (?) GROUP BY post_id', [ids])).map((r) => [r['post_id'] as string, Number(r['c'])]));
  const mine = new Set(uid ? (await q<RowDataPacket>('SELECT post_id FROM post_likes WHERE user_id=? AND post_id IN (?)', [uid, ids])).map((r) => r['post_id'] as string) : []);
  const comments = await q<RowDataPacket>('SELECT * FROM comments WHERE post_id IN (?) ORDER BY created_at ASC', [ids]);
  const byPost = new Map<string, PostOut['comments']>();
  for (const c of comments) {
    const arr = byPost.get(c['post_id']) ?? [];
    arr.push({ id: c['id'], authorId: c['author_id'] ?? '', author: c['author_name'], avatar: c['avatar'], text: c['text'], createdAt: iso(c['created_at']) });
    byPost.set(c['post_id'], arr);
  }
  return posts.map((p) => ({
    id: p['id'], authorId: p['author_id'] ?? '', authorName: p['author_name'], authorHeadline: p['author_headline'], authorAvatar: p['author_avatar'], verified: !!p['verified'],
    createdAt: iso(p['created_at']), content: p['content'], mediaType: p['media_type'] ?? undefined, mediaUrl: p['media_url'] ?? undefined, videoTitle: p['video_title'] ?? undefined,
    tags: JSON.parse(p['tags']), likes: likes.get(p['id']) ?? 0, likedByMe: mine.has(p['id']), comments: byPost.get(p['id']) ?? [], mine: !!uid && p['author_id'] === uid,
  }));
}

export async function createPost(p: { id: string; authorId: string; authorName: string; authorHeadline: string; authorAvatar: string; content: string; mediaType?: string; mediaUrl?: string; videoTitle?: string; tags: string[] }) {
  await exec('INSERT INTO posts (id,author_id,author_name,author_headline,author_avatar,verified,content,media_type,media_url,video_title,tags,created_at) VALUES (?,?,?,?,?,0,?,?,?,?,?,?)',
    [p.id, p.authorId, p.authorName, p.authorHeadline, p.authorAvatar, p.content, p.mediaType ?? null, p.mediaUrl ?? null, p.videoTitle ?? null, JSON.stringify(p.tags), new Date()]);
}
export async function getPostAuthor(id: string): Promise<{ exists: boolean; authorId: string | null }> {
  const r = await q<RowDataPacket>('SELECT author_id FROM posts WHERE id=?', [id]);
  return { exists: !!r[0], authorId: r[0]?.['author_id'] ?? null };
}
export async function deletePost(id: string) { await exec('DELETE FROM posts WHERE id=?', [id]); }
export async function toggleLike(postId: string, userId: string): Promise<{ likes: number; likedByMe: boolean }> {
  const del = await exec('DELETE FROM post_likes WHERE post_id=? AND user_id=?', [postId, userId]);
  if (del.affectedRows === 0) await exec('INSERT IGNORE INTO post_likes (post_id,user_id,created_at) VALUES (?,?,?)', [postId, userId, new Date()]);
  const likes = Number((await q<RowDataPacket>('SELECT COUNT(*) c FROM post_likes WHERE post_id=?', [postId]))[0]['c']);
  return { likes, likedByMe: del.affectedRows === 0 };
}
export async function addComment(c: { id: string; postId: string; authorId: string; author: string; avatar: string; text: string }) {
  const at = new Date();
  await exec('INSERT INTO comments (id,post_id,author_id,author_name,avatar,text,created_at) VALUES (?,?,?,?,?,?,?)', [c.id, c.postId, c.authorId, c.author, c.avatar, c.text, at]);
  return { id: c.id, authorId: c.authorId, author: c.author, avatar: c.avatar, text: c.text, createdAt: at.toISOString() };
}

/** Inserts the three starter posts the first time the table is empty. */
export async function seedPostsIfEmpty() {
  if (Number((await q<RowDataPacket>('SELECT COUNT(*) c FROM posts'))[0]['c']) > 0) return;
  const h = (n: number) => new Date(Date.now() - n * 3600_000);
  const ins = (id: string, name: string, headline: string, avatar: string, verified: number, content: string, media: string | null, tags: string[], at: Date) =>
    exec('INSERT INTO posts (id,author_id,author_name,author_headline,author_avatar,verified,content,media_type,media_url,tags,created_at) VALUES (?,NULL,?,?,?,?,?,?,?,?,?)',
      [id, name, headline, avatar, verified, content, media ? 'image' : null, media, JSON.stringify(tags), at]);
  await ins('seed-1', 'Krushna Arun More', 'Lead Security Researcher | CyberAid Team, PRPCEM', 'https://api.dicebear.com/7.x/bottts/svg?seed=krushna', 1,
    '🚨 ADVISORY: A phishing ring is impersonating SBI KYC update portals on .xyz domains. The SMS creates artificial urgency ("Account will be deactivated within 12 hours") and asks for an OTP via an unencrypted HTTP link.\n\n⚠️ Indicator: genuine banks never ask for OTP/PIN over SMS links or request UPI collect approvals. Paste suspicious links into CyberAid Verify before you tap.',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80', ['#PhishingAlert', '#CyberForensics', '#GoldenHourDefense', '#BankingFraud'], h(2));
  await ins('seed-2', 'Meera Deshmukh', 'SME Retail Owner | Recovered Cybercrime Victim', 'https://api.dicebear.com/7.x/avataaars/svg?seed=meera', 0,
    'Sharing my experience for other small business owners: a caller said he had accidentally sent ₹45,000 to my Google Pay and then sent a QR code saying "scan to return the money".\n\nI remembered the rule: you NEVER scan a QR code to RECEIVE money. That saved my shop capital.',
    null, ['#VictimTestimonial', '#UPIFraud', '#SmallBizSecurity'], h(5));
  await ins('seed-3', 'Jaffar Ahmed Khan', 'Threat Intelligence Analyst | CyberAid Core', 'https://api.dicebear.com/7.x/bottts/svg?seed=jaffar', 1,
    'Sharp rise in "Digital Arrest" extortion calls where criminals pose as Crime Branch / CBI / ED officers on WhatsApp or Skype video. Indian agencies never arrest, negotiate bail or clear funds over video calls. Disconnect and dial 1930.',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80', ['#DigitalArrest', '#ExtortionAlert', '#Helpline1930'], h(26));
}

/* ================================================================ quiz */
export async function addQuizScore(userId: string, name: string, score: number, total: number) {
  await exec('INSERT INTO quiz_scores (user_id,name,score,total,created_at) VALUES (?,?,?,?,?)', [userId, name, score, total, new Date()]);
}
export async function quizStats(userId: string) {
  const r = (await q<RowDataPacket>('SELECT COUNT(*) n, COALESCE(MAX(ROUND(score/total*100)),0) best FROM quiz_scores WHERE user_id=?', [userId]))[0];
  return { attempts: Number(r['n']), best: Number(r['best']) };
}
export async function quizLeaderboard() {
  return (await q<RowDataPacket>('SELECT MAX(name) name, MAX(ROUND(score/total*100)) pct, COUNT(*) attempts FROM quiz_scores GROUP BY user_id ORDER BY pct DESC, attempts DESC LIMIT 8'))
    .map((r) => ({ name: r['name'] as string, pct: Number(r['pct']), attempts: Number(r['attempts']) }));
}
