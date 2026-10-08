import { createHash } from 'node:crypto';
import type { EmailBatchItem, EmailForensicReport, EmailInput, Verdict } from '../../shared/api-types';
import { predictText, textModelVersion } from './text-classifier';
import { BRANDS, reputationOf } from './reputation';
import { extractUrls, hostOf } from './extract';
import { analyzeUrl } from './entity-analyzer';
import { registeredDomain } from './url-classifier';

const noisyOr = (ps: number[]) => 1 - ps.reduce((a, p) => a * (1 - Math.min(Math.max(p, 0), 0.999)), 1);

/* ------------------------------------------------------------------ header parsing */
export function parseHeaders(raw: string): Map<string, string[]> {
  const head = raw.split(/\r?\n\r?\n/)[0];
  const lines = head.split(/\r?\n/);
  const out = new Map<string, string[]>();
  let cur: [string, string] | null = null;
  const flush = () => { if (cur) { const k = cur[0].toLowerCase(); out.set(k, [...(out.get(k) ?? []), cur[1].trim()]); } };
  for (const l of lines) {
    if (/^\s/.test(l) && cur) cur[1] += ' ' + l.trim();
    else {
      flush();
      const i = l.indexOf(':');
      cur = i > 0 ? [l.slice(0, i), l.slice(i + 1)] : null;
    }
  }
  flush();
  return out;
}

function bodyOf(raw: string): string {
  const parts = raw.split(/\r?\n\r?\n/);
  return parts.slice(1).join('\n\n');
}

const addrParts = (v: string) => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  const addr = (m ? m[2] : v).trim().toLowerCase().replace(/^mailto:/, '');
  const name = m ? m[1].trim() : '';
  const domain = addr.includes('@') ? addr.split('@').pop()!.replace(/[>\s]/g, '') : '';
  return { name, addr, domain };
};

type Tri<T extends string> = T;
function authResult(h: Map<string, string[]>) {
  const ar = (h.get('authentication-results') ?? []).join(' ; ').toLowerCase();
  const rs = (h.get('received-spf') ?? [''])[0].toLowerCase();
  const pick = (name: string): string | null => new RegExp(`\\b${name}=(pass|fail|softfail|neutral|none|temperror|permerror|bestguesspass|policy)`).exec(ar)?.[1] ?? null;
  let spf = pick('spf') ?? (/^(pass|fail|softfail|neutral|none)/.exec(rs)?.[1] ?? null);
  const dkim = pick('dkim');
  const dmarc = pick('dmarc');
  const mapSpf = (x: string | null): Tri<'pass' | 'fail' | 'softfail' | 'none'> => (x === 'pass' ? 'pass' : x === 'fail' || x === 'permerror' ? 'fail' : x === 'softfail' ? 'softfail' : 'none');
  const mapOther = (x: string | null): Tri<'pass' | 'fail' | 'none'> => (x === 'pass' ? 'pass' : x === 'fail' || x === 'permerror' ? 'fail' : 'none');
  return { spf: mapSpf(spf), dkim: mapOther(dkim), dmarc: mapOther(dmarc), present: !!ar || !!rs };
}

const isPrivate = (ip: string) => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/.test(ip);

function relayHops(h: Map<string, string[]>) {
  const rec = h.get('received') ?? [];
  const hops = rec.map((r) => {
    const from = /\bfrom\s+(\S+)/i.exec(r)?.[1] ?? '—';
    const by = /\bby\s+(\S+)/i.exec(r)?.[1] ?? '—';
    const ips = [...r.matchAll(/\[?\b(\d{1,3}(?:\.\d{1,3}){3})\b\]?/g)].map((m) => m[1]).filter((ip) => ip.split('.').every((o) => +o <= 255));
    return { from, by, ip: ips.find((ip) => !isPrivate(ip)) ?? ips[0] ?? '—' };
  });
  return hops.reverse().slice(0, 12).map((x, i) => ({ hopNumber: i + 1, ...x })); // 1 = earliest
}

/* ------------------------------------------------------------------ live lookups (best effort) */
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v as T;
  try { const v = await fn(); cache.set(key, { at: Date.now(), v }); return v; } catch { return null; }
}

async function rdap(domain: string) {
  return cached(`rdap:${domain}`, async () => {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(4500), headers: { accept: 'application/rdap+json' } });
    if (!r.ok) throw new Error('rdap ' + r.status);
    const j = (await r.json()) as { events?: { eventAction: string; eventDate: string }[]; entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, unknown, string][]] }[] };
    const created = j.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    const reg = j.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3];
    return { created, registrar: reg };
  });
}

async function geoip(ip: string) {
  return cached(`geo:${ip}`, async () => {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(4500) });
    const j = (await r.json()) as { success?: boolean; country?: string; city?: string; connection?: { isp?: string; org?: string } };
    if (!j.success) throw new Error('geo');
    return { country: j.country ?? '—', city: j.city ?? '—', isp: j.connection?.isp || j.connection?.org || '—' };
  });
}

/* ------------------------------------------------------------------ main */
export interface ForensicOptions { deep: boolean; userId: string | null }

export async function analyzeEmail(input: EmailInput, opts: ForensicOptions): Promise<EmailForensicReport> {
  let h = new Map<string, string[]>();
  let body = input.body ?? '';
  const rawForHash = input.raw ?? JSON.stringify(input);
  if (input.raw) { h = parseHeaders(input.raw); body = body || bodyOf(input.raw); }
  if (input.headers) for (const { name, value } of input.headers) h.set(name.toLowerCase(), [...(h.get(name.toLowerCase()) ?? []), value]);

  const fromRaw = input.from ?? h.get('from')?.[0] ?? '';
  const subject = input.subject ?? h.get('subject')?.[0] ?? '(no subject)';
  const date = h.get('date')?.[0] ?? '—';
  const text = (body || input.snippet || '').replace(/<[^>]+>/g, ' ').slice(0, 8000);
  const from = addrParts(fromRaw);
  const rp = addrParts(h.get('return-path')?.[0] ?? '');
  const replyTo = addrParts(h.get('reply-to')?.[0] ?? '');
  const auth = authResult(h);
  const fromReg = registeredDomain(from.domain);
  const rpMismatch = !!rp.domain && !!from.domain && registeredDomain(rp.domain) !== fromReg;
  const replyMismatch = !!replyTo.domain && !!from.domain && registeredDomain(replyTo.domain) !== fromReg;

  // ---- ML on text
  const t = predictText(`${subject}. ${text}`);
  // ---- links
  const urls = extractUrls(`${text} ${subject}`).slice(0, 10);
  const links = await Promise.all(urls.map(async (u) => { const r = await analyzeUrl(u, { userId: opts.userId }); return { url: u, verdict: (r.p >= 0.8 ? 'high' : r.p >= 0.4 ? 'suspicious' : 'safe') as Verdict, score: Math.round(r.p * 100), p: r.p }; }));
  const worstLink = links.reduce((m, l) => Math.max(m, l.p), 0);
  // ---- sender reputation
  const senderRep = from.domain ? reputationOf(from.domain) : null;
  const brandSpoof = Object.values(BRANDS).find((b) => {
    const dn = (from.name + ' ' + from.addr.split('@')[0]).toLowerCase();
    return b.keywords.some((k) => (k.length >= 5 ? dn.includes(k) : new RegExp(`\\b${k}\\b`).test(dn))) && !b.domains.includes(fromReg);
  });

  // ---- live lookups
  const hops = relayHops(h);
  const firstIp = hops.find((x) => x.ip !== '—' && !isPrivate(x.ip))?.ip ?? '—';
  let domainAge: number | null = null, created = '—', registrar = '—';
  let geo: { country: string; city: string; isp: string } | null = null;
  if (opts.deep) {
    const [rd, g] = await Promise.all([
      from.domain && !senderRep?.trusted ? rdap(fromReg) : Promise.resolve(null),
      firstIp !== '—' ? geoip(firstIp) : Promise.resolve(null),
    ]);
    if (rd?.created) { created = rd.created.slice(0, 10); domainAge = Math.floor((Date.now() - Date.parse(rd.created)) / 86400000); }
    if (rd?.registrar) registrar = rd.registrar;
    geo = g;
  }

  // ---- fuse risks
  const parts: { p: number; why: string }[] = [];
  parts.push({ p: t.probability, why: `Message-text model: ${(t.probability * 100).toFixed(0)}% scam probability` });
  if (worstLink >= 0.4) parts.push({ p: worstLink * 0.9, why: `A link in the body looks risky (${Math.round(worstLink * 100)}%)` });
  if (auth.dmarc === 'fail') parts.push({ p: 0.35, why: 'DMARC alignment check failed' });
  if (auth.dkim === 'fail') parts.push({ p: 0.25, why: 'DKIM signature verification failed' });
  if (auth.spf === 'fail') parts.push({ p: 0.3, why: 'SPF check failed — sending server not authorised for the domain' });
  else if (auth.spf === 'softfail') parts.push({ p: 0.15, why: 'SPF soft-fail' });
  if (rpMismatch) parts.push({ p: 0.2, why: `Return-Path domain (${rp.domain}) differs from From domain (${from.domain})` });
  if (replyMismatch) parts.push({ p: 0.2, why: `Reply-To domain (${replyTo.domain}) differs from From domain` });
  if (brandSpoof) parts.push({ p: 0.5, why: `Display name imitates ${brandSpoof.label} but the domain is ${fromReg}` });
  if (domainAge !== null && domainAge < 30) parts.push({ p: 0.4, why: `Sender domain registered only ${domainAge} days ago` });
  else if (domainAge !== null && domainAge < 90) parts.push({ p: 0.2, why: `Sender domain is young (${domainAge} days)` });
  if (senderRep && !senderRep.trusted && senderRep.rank === null && from.domain) parts.push({ p: 0.05, why: `Sender domain ${fromReg} is not a widely known domain` });
  let p = noisyOr(parts.map((x) => x.p));
  // authenticated mail from a verified brand domain with clean links should not be dragged up by wording alone
  if (senderRep?.trusted && auth.dmarc === 'pass' && worstLink < 0.4) p = Math.min(p, 0.2);

  const verdict: 'HIGH' | 'MEDIUM' | 'LOW' = p >= 0.75 ? 'HIGH' : p >= 0.4 ? 'MEDIUM' : 'LOW';
  const label = brandSpoof ? `Brand impersonation (${brandSpoof.label})`
    : verdict === 'LOW' ? 'No malicious indicators found'
    : worstLink >= 0.4 && t.probability >= 0.5 ? 'Credential-harvesting phishing'
    : auth.dmarc === 'fail' || auth.spf === 'fail' ? 'Spoofed sender'
    : 'Suspicious bulk / social-engineering message';
  const sha = createHash('sha256').update(rawForHash).digest('hex');
  const campaign = 'CAMP-' + createHash('sha1').update(`${fromReg}|${subject.toLowerCase().replace(/\d+/g, '#')}`).digest('hex').slice(0, 6).toUpperCase();
  const cloud = !!geo && /amazon|google|microsoft|digitalocean|ovh|hetzner|linode|vultr|cloudflare|azure/i.test(geo.isp);

  const actions =
    verdict === 'HIGH' ? ['Do not click links or open attachments', 'Quarantine the message and report it as phishing in your mail client', 'Block the sender domain', 'If you already entered credentials, change the password and enable 2-step verification now', 'Report on cybercrime.gov.in / call 1930 if money or data was lost']
    : verdict === 'MEDIUM' ? ['Verify the sender through the official website or app, not through this message', 'Do not click links until verified']
    : ['No strong phishing indicators. Still avoid sharing OTP/PIN/passwords by email.'];

  return {
    caseId: 'case-' + sha.slice(0, 8),
    generatedDate: new Date().toISOString(),
    threatScore: Math.round(p * 100), verdict, attributionLabel: label,
    attributionConfidence: Math.round(Math.max(p, 1 - p) * 100),
    campaignId: verdict === 'LOW' ? 'CAMP-NONE' : campaign,
    limitedForensicsMode: !auth.present || !input.raw && !input.headers,
    senderInfo: { from: fromRaw || '—', fromDisplayName: from.name || '—', fromDomain: from.domain || '—', returnPathDomain: rp.domain || '—', subject, date },
    authentication: { spf: auth.spf, dkim: auth.dkim, dmarc: auth.dmarc, returnPathMismatch: rpMismatch },
    networkIntelligence: {
      earliestPublicRelayIp: firstIp, probableCountry: geo?.country ?? (opts.deep ? 'lookup unavailable' : '—'), probableCity: geo?.city ?? '—', ispOrg: geo?.isp ?? '—',
      locationDisclaimer: 'Probable sending infrastructure location — NOT a confirmed attacker location.',
      torExitNode: false, knownVpnProvider: false, genericCloudHosting: cloud,
    },
    domainWhois: { registrar, creationDate: created, domainAgeDays: domainAge ?? '—' },
    relayPath: hops,
    scoringRationale: parts.filter((x) => x.p >= 0.15).map((x) => x.why).concat(verdict === 'LOW' ? ['No individual risk component was significant'] : []),
    machineLearningAssessment: {
      modelName: `TF-IDF + logistic regression v${textModelVersion}`,
      summary: `Scam probability ${(t.probability * 100).toFixed(1)}% from message wording; ${links.length} link(s) analysed separately.`,
      topPhrases: t.topFeatures.filter((f) => f.contribution > 0).slice(0, 6).map((f) => ({ phrase: f.feature, weight: f.contribution })),
    },
    linkAnalysis: links.map(({ url, verdict: v, score }) => ({ url, verdict: v, score })),
    recommendedActions: { riskTitle: verdict === 'HIGH' ? 'Elevated risk detected' : verdict === 'MEDIUM' ? 'Verify before acting' : 'Standard hygiene guidance', items: actions },
    evidenceIntegrity: { sha256: sha },
    attributionLimitations: 'Indicators (IP addresses, geolocation, relay hops, domain data) describe observed sending infrastructure only, not a person. Headers can be forged. Treat conclusions as investigative leads that need corroboration, not proof of identity or location. Lookups (RDAP, IP geolocation) are best-effort and may be unavailable.',
  };
}

export function toBatchItem(id: string, r: EmailForensicReport, snippet: string): EmailBatchItem {
  return {
    id, sender: r.senderInfo.from, subject: r.senderInfo.subject, date: r.senderInfo.date, snippet, verdict: r.verdict, score: r.threatScore,
    category: r.attributionLabel, reasons: r.scoringRationale, links: r.linkAnalysis.map((l) => l.url), recommendedAction: r.recommendedActions.items[0] ?? '',
  };
}

export { hostOf };
