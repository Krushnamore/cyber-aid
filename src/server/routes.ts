import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { EmailInput, ScanKind } from '../shared/api-types';
import { authenticate, rateLimit, requireUser, userOf } from './auth';
import { authApi } from './auth-routes';
import { chat, type ChatTurn } from './assistant';
import { dbConfigured, initDb } from './db';
import { llmProvider } from './llm';
import { analyze, enrichWithDomainAge } from './ml/entity-analyzer';
import { analyzeEmail, toBatchItem } from './ml/email-forensics';
import { textModelCard } from './ml/text-classifier';
import { urlModelCard } from './ml/url-classifier';
import { ensureAiCache, getNational, refreshWithLlm } from './national-data';
import { gradeQuiz, startQuiz } from './quiz';
import * as repo from './repo';
import { SAMPLE_EMAILS } from './samples';

export const api = Router();

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const KINDS: ScanKind[] = ['url', 'upi', 'phone', 'text', 'qr', 'email'];
const httpUrl = (v: unknown) => { const s = str(v, 1000); try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? s : ''; } catch { return ''; } };
/** wraps async handlers so DB/LLM failures become JSON errors instead of hanging requests */
const h = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch((e) => { console.error('[api]', req.method, req.path, e); if (!res.headersSent) res.status(500).json({ error: 'Server error. Please try again.' }); void next; });

/* ---------------------------------------------------------------- health + model cards (no DB needed) */
api.get('/health', h(async (_req, res) => {
  let db = false, error: string | undefined;
  if (dbConfigured()) { try { await initDb(); db = true; } catch (e) { error = (e as Error).message; } } else error = 'DATABASE_URL not set';
  res.json({ ok: db, db, error, time: new Date().toISOString(), llm: llmProvider(), email: !!process.env['RESEND_API_KEY'] });
}));
api.get('/ml/models', (_req, res) => res.json({ models: [textModelCard(), urlModelCard()] }));

/* ---------------------------------------------------------------- everything below needs MySQL */
let seeded = false;
api.use(async (_req, res, next) => {
  try { await initDb(); if (!seeded) { await repo.seedPostsIfEmpty(); seeded = true; } next(); }
  catch (e) { console.error('[db]', (e as Error).message); res.status(503).json({ error: dbConfigured() ? 'Database is unavailable. Try again shortly.' : 'Database not configured. Set DATABASE_URL.' }); }
});
api.use(authenticate);
api.use('/auth', authApi);

/* ---------------------------------------------------------------- scanning */
api.post('/scan', rateLimit(40), h(async (req, res) => {
  const input = str(req.body?.input, 8000);
  const mode = ['text', 'phone', 'qr'].includes(req.body?.mode) ? req.body.mode : undefined;
  if (!input) { res.status(400).json({ error: 'input is required' }); return; }
  res.json(await enrichWithDomainAge(await analyze(input, mode, { userId: userOf(res)?.id ?? null })));
}));

api.get('/samples/emails', (_req, res) => res.json({ samples: SAMPLE_EMAILS }));

const cleanHeaders = (v: unknown) => (Array.isArray(v) ? v.slice(0, 200).map((x: { name?: unknown; value?: unknown }) => ({ name: str(x.name, 100), value: str(x.value, 4000) })) : undefined);

api.post('/scan/email', rateLimit(20), h(async (req, res) => {
  const b = req.body ?? {};
  const input: EmailInput = { raw: str(b.raw, 400_000) || undefined, headers: cleanHeaders(b.headers), from: str(b.from, 500) || undefined, subject: str(b.subject, 1000) || undefined, body: str(b.body, 100_000) || undefined, snippet: str(b.snippet, 2000) || undefined };
  if (!input.raw && !input.headers && !input.body && !input.snippet) { res.status(400).json({ error: 'Provide raw e-mail, headers or body text' }); return; }
  const uid = userOf(res)?.id ?? null;
  const report = await analyzeEmail(input, { deep: b.deep !== false, userId: uid });
  await repo.addScan({ id: report.caseId, ts: report.generatedDate, kind: 'email', verdict: report.verdict === 'HIGH' ? 'high' : report.verdict === 'MEDIUM' ? 'suspicious' : 'safe', score: report.threatScore, userId: uid });
  res.json({ report });
}));

api.post('/scan/email-batch', rateLimit(10), h(async (req, res) => {
  const list: (EmailInput & { id: string })[] = Array.isArray(req.body?.emails) ? req.body.emails.slice(0, 25) : [];
  if (!list.length) { res.status(400).json({ error: 'emails[] required' }); return; }
  const items = [];
  for (const e of list) {
    const r = await analyzeEmail({ id: str(e.id, 100), raw: str(e.raw, 400_000) || undefined, headers: cleanHeaders(e.headers), body: str(e.body, 100_000), snippet: str(e.snippet, 2000), from: str(e.from, 500), subject: str(e.subject, 1000) }, { deep: false, userId: userOf(res)?.id ?? null });
    items.push(toBatchItem(str(e.id, 100) || r.caseId, r, str(e.snippet, 300)));
  }
  res.json({ items });
}));

/* ---------------------------------------------------------------- community reports & blocklist */
api.post('/reports', requireUser, rateLimit(20), h(async (req, res) => {
  const kind = KINDS.includes(req.body?.kind) ? (req.body.kind as ScanKind) : 'text';
  const value = str(req.body?.value, 500);
  if (!value) { res.status(400).json({ error: 'value required' }); return; }
  const key = repo.entityKey(kind, value);
  const added = await repo.addReport({ id: randomUUID(), key, kind, value, note: str(req.body?.note, 500) || undefined, reporterId: userOf(res)!.id });
  res.json({ ok: true, duplicate: !added, reports: await repo.countReports(key) });
}));

api.get('/blocklist', requireUser, h(async (_req, res) => res.json({ items: await repo.listBlocks(userOf(res)!.id) })));
api.post('/blocklist', requireUser, h(async (req, res) => {
  const kind = KINDS.includes(req.body?.kind) ? (req.body.kind as ScanKind) : 'url';
  const value = str(req.body?.value, 500);
  if (!value) { res.status(400).json({ error: 'value required' }); return; }
  await repo.addBlock(userOf(res)!.id, repo.entityKey(kind, value), kind, value);
  res.json({ ok: true });
}));
api.delete('/blocklist', requireUser, h(async (req, res) => { await repo.removeBlock(userOf(res)!.id, str(req.query['key'], 255)); res.json({ ok: true }); }));

/* ---------------------------------------------------------------- community feed */
api.get('/community/posts', h(async (_req, res) => res.json({ posts: await repo.listPosts(userOf(res)?.id ?? null) })));

api.post('/community/posts', requireUser, rateLimit(10), h(async (req, res) => {
  const me = userOf(res)!;
  const content = str(req.body?.content, 3000);
  if (content.length < 5) { res.status(400).json({ error: 'Write at least a few words.' }); return; }
  const mediaType = req.body?.mediaType === 'image' || req.body?.mediaType === 'video' ? req.body.mediaType : undefined;
  const mediaUrl = mediaType ? httpUrl(req.body?.mediaUrl) : '';
  if (mediaType && !mediaUrl) { res.status(400).json({ error: 'Media URL must be a valid http(s) link.' }); return; }
  const tags = (Array.isArray(req.body?.tags) ? req.body.tags : []).map((t: unknown) => str(t, 40)).filter((t: string) => /^#\w+$/.test(t)).slice(0, 6);
  const id = 'post-' + randomUUID().slice(0, 8);
  await repo.createPost({ id, authorId: me.id, authorName: me.name, authorHeadline: me.headline, authorAvatar: me.avatar, content, mediaType, mediaUrl: mediaUrl || undefined, videoTitle: str(req.body?.videoTitle, 120) || undefined, tags: tags.length ? tags : ['#CyberAwareness'] });
  const post = (await repo.listPosts(me.id)).find((p) => p.id === id);
  res.status(201).json({ post });
}));

api.delete('/community/posts/:id', requireUser, h(async (req, res) => {
  const { exists, authorId } = await repo.getPostAuthor(String(req.params['id']));
  if (!exists) { res.status(404).json({ error: 'Post not found' }); return; }
  if (authorId !== userOf(res)!.id) { res.status(403).json({ error: 'You can only delete your own posts' }); return; }
  await repo.deletePost(String(req.params['id']));
  res.json({ ok: true });
}));

api.post('/community/posts/:id/like', requireUser, h(async (req, res) => {
  if (!(await repo.getPostAuthor(String(req.params['id']))).exists) { res.status(404).json({ error: 'Post not found' }); return; }
  res.json(await repo.toggleLike(String(req.params['id']), userOf(res)!.id));
}));

api.post('/community/posts/:id/comments', requireUser, rateLimit(20), h(async (req, res) => {
  const text = str(req.body?.text, 1000);
  if (!(await repo.getPostAuthor(String(req.params['id']))).exists) { res.status(404).json({ error: 'Post not found' }); return; }
  if (!text) { res.status(400).json({ error: 'Comment text required' }); return; }
  const me = userOf(res)!;
  res.status(201).json({ comment: await repo.addComment({ id: 'c-' + randomUUID().slice(0, 8), postId: String(req.params['id']), authorId: me.id, author: me.name, avatar: me.avatar, text }) });
}));

/* ---------------------------------------------------------------- analytics */
api.get('/analytics', h(async (_req, res) => {
  const [platform, national] = await Promise.all([repo.platformStats(), getNational()]);
  res.json({ platform: { ...platform, models: [textModelCard(), urlModelCard()].map((m) => ({ name: m.name, version: m.version, metrics: m.metrics })) }, national });
  void ensureAiCache();
}));

api.post('/analytics/refresh', requireUser, rateLimit(3, 3600_000), h(async (_req, res) => {
  const r = await refreshWithLlm();
  res.status(r.ok ? 200 : 503).json({ ...r, national: await getNational() });
}));

/* ---------------------------------------------------------------- quiz */
api.get('/quiz/start', rateLimit(30), h(async (req, res) => res.json(await startQuiz(Number(req.query['count']) || 5, req.query['ai'] === '1'))));

api.post('/quiz/submit', rateLimit(30), h(async (req, res) => {
  const answers: Record<string, number> = {};
  if (req.body?.answers && typeof req.body.answers === 'object') for (const [k, v] of Object.entries(req.body.answers)) if (Number.isInteger(v)) answers[k.slice(0, 20)] = v as number;
  const g = gradeQuiz(str(req.body?.sessionId, 80), answers);
  if (!g) { res.status(404).json({ error: 'Quiz session expired or already submitted. Start a new quiz.' }); return; }
  const me = userOf(res);
  if (me) await repo.addQuizScore(me.id, me.name, g.score, g.total);
  const stats = me ? await repo.quizStats(me.id) : { attempts: 0, best: 0 };
  res.json({ ...g, saved: !!me, ...stats });
}));

api.get('/quiz/leaderboard', h(async (_req, res) => res.json({ top: await repo.quizLeaderboard() })));

/* ---------------------------------------------------------------- assistant */
api.post('/assistant/chat', rateLimit(15), h(async (req, res) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const history: ChatTurn[] = raw.slice(-14).map((m: { role?: string; text?: unknown }) => ({ role: m.role === 'bot' ? 'bot' : 'user', text: str(m.text, 2000) })).filter((m: ChatTurn) => m.text);
  if (!history.length || history[history.length - 1].role !== 'user') { res.status(400).json({ error: 'messages must end with a user message' }); return; }
  res.json(await chat(history));
}));

api.use((_req, res) => res.status(404).json({ error: 'Unknown API route' }));
