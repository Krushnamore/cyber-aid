import { randomUUID } from 'node:crypto';
import type { ModelInfo, ScanKind, ScanResponse, Signal, Verdict } from '../../shared/api-types';
import { predictText, textModelVersion, textThresholds } from './text-classifier';
import { normalizeUrl, predictUrl, splitHostPath, urlModelVersion, urlThresholds } from './url-classifier';
import { BRANDS, RISKY_TLDS, SHORTENERS, SUSPICIOUS_PATH_WORDS, detectImpersonation, reputationOf } from './reputation';
import { extractPhones, extractUrls, extractVpas, hostOf } from './extract';
import { addScan, countReports, entityKey, isBlocked } from '../repo';

const noisyOr = (...ps: number[]) => 1 - ps.reduce((a, p) => a * (1 - Math.min(Math.max(p, 0), 0.999)), 1);
const verdictOf = (p: number, t: { suspicious: number; high: number }): Verdict => (p >= t.high ? 'high' : p >= t.suspicious ? 'suspicious' : 'safe');
const sig = (id: string, label: string, weight: number, kind: Signal['kind']): Signal => ({ id, label, weight, kind });

export interface Ctx { userId: string | null }
interface Part { p: number; signals: Signal[]; models: ModelInfo[]; kind: ScanKind; reports: number; blocked: boolean }

/* ------------------------------------------------------------------ URL */
export async function analyzeUrl(raw: string, ctx: Ctx): Promise<Part> {
  const url = raw.trim();
  const n = normalizeUrl(url);
  const { host, rest } = splitHostPath(n);
  const ml = predictUrl(url);
  const signals: Signal[] = [sig('ml-url', `URL model phishing probability ${(ml.probability * 100).toFixed(0)}%`, ml.probability, 'ml')];
  const rep = reputationOf(host);
  const tld = host.split('.').pop() ?? '';
  const rules: number[] = [];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { rules.push(0.35); signals.push(sig('ip-host', 'Uses a raw IP address instead of a domain name', 0.35, 'rule')); }
  if (n.split('/')[0].includes('@')) { rules.push(0.4); signals.push(sig('userinfo', 'Contains "@" — the real host is whatever follows it', 0.4, 'rule')); }
  if (host.includes('xn--')) { rules.push(0.3); signals.push(sig('punycode', 'Punycode (xn--) domain — possible look-alike characters', 0.3, 'rule')); }
  if (RISKY_TLDS.has(tld) && !rep.trusted) { rules.push(0.1); signals.push(sig('risky-tld', `.${tld} is a TLD heavily abused in phishing campaigns`, 0.1, 'rule')); }
  if (SHORTENERS.has(rep.registered)) { rules.push(0.15); signals.push(sig('shortener', 'URL shortener hides the real destination', 0.15, 'rule')); }
  if (/^http:\/\//i.test(url) && /login|signin|verify|kyc|pay|bank/.test(n)) { rules.push(0.1); signals.push(sig('no-tls', 'Sensitive page served without HTTPS', 0.1, 'rule')); }
  if (host.split('.').length > 4) { rules.push(0.12); signals.push(sig('deep-subdomain', 'Unusually many subdomain levels', 0.12, 'rule')); }
  const words = SUSPICIOUS_PATH_WORDS.filter((w) => n.includes(w));
  if (words.length && !rep.trusted) { const w = Math.min(0.05 * words.length, 0.15); rules.push(w); signals.push(sig('path-words', `Credential-bait words in URL: ${words.slice(0, 4).join(', ')}`, w, 'rule')); }

  const imp = detectImpersonation(host);
  if (imp) {
    const w = imp.type === 'brand-in-host' ? 0.55 : 0.7;
    rules.push(w);
    signals.push(sig(imp.type, imp.detail, w, 'rule'));
  }

  let p = noisyOr(ml.probability, ...rules.map((r) => r * 0.9));

  // reputation: lowers risk only when the domain really is the reputable one
  if (rep.trusted && !imp) {
    p = Math.min(p, 0.1);
    signals.push(sig('trusted-domain', `${rep.registered} is a verified official / government domain`, -0.8, 'reputation'));
  } else if (rep.rank && !rep.hostingPlatform && !imp) {
    const f = rep.rank <= 5000 ? 0.2 : rep.rank <= 20000 ? 0.35 : 0.5;
    p *= f;
    signals.push(sig('popular-domain', `${rep.registered} is a long-established popular domain (top-${rep.rank <= 5000 ? '5k' : rep.rank <= 20000 ? '20k' : '60k'})`, -(1 - f), 'reputation'));
  } else if (rep.hostingPlatform) {
    signals.push(sig('shared-hosting', `${rep.registered} is a free/shared hosting platform — anyone can publish here`, 0.1, 'rule'));
    p = noisyOr(p, 0.05);
  }

  // Calibration: an n-gram model alone cannot tell a small genuine business domain from a throw-away phishing host.
  // Without corroborating rule signals or community reports, cap below the "high" band (still flagged as suspicious).
  const key = entityKey('url', url);
  const reports = await countReports(key);
  if (rules.length === 0 && reports === 0 && ml.probability < 0.97 && !rep.trusted) {
    if (p > 0.74) signals.push(sig('uncorroborated', 'Only the statistical model flags this domain — treated as suspicious, not confirmed', 0, 'rule'));
    p = Math.min(p, 0.74);
  }

  // community + user blocklist
  if (reports) {
    const w = Math.min(0.2 * reports, 0.9);
    signals.push(sig('community', `${reports} independent community report(s) for ${rep.registered}`, w, 'community'));
    p = noisyOr(p, w);
    if (reports >= 3) p = Math.max(p, 0.55);
    if (reports >= 5) p = Math.max(p, 0.85);
  }
  const blocked = ctx.userId ? await isBlocked(ctx.userId, key) : false;
  if (blocked) { p = Math.max(p, 0.9); signals.push(sig('blocklist', 'You previously blocked this domain', 0.9, 'community')); }

  const models: ModelInfo[] = [{ name: 'URL phishing classifier', version: urlModelVersion, probability: ml.probability, topFeatures: ml.topFeatures }];
  void rest;
  return { p, signals, models, kind: 'url', reports, blocked };
}

/* ------------------------------------------------------------------ UPI VPA */
const KNOWN_HANDLES = new Set(['ybl', 'ibl', 'axl', 'okhdfcbank', 'okicici', 'oksbi', 'okaxis', 'paytm', 'apl', 'upi', 'sbi', 'hdfcbank', 'icici', 'axisbank', 'kotak', 'pnb', 'boi', 'cnrb', 'unionbank', 'idfcbank', 'indus', 'federal', 'yesbank', 'rbl', 'aubank', 'jupiteraxis', 'fam', 'freecharge', 'postbank', 'ikwik', 'airtel', 'jio', 'slc', 'ezeepay', 'dbs', 'barodampay', 'psb', 'okbizaxis', 'abfspay', 'waicici', 'wahdfcbank', 'wasbi', 'waaxis', 'yapl', 'yesg', 'pingpay', 'cmsidfc', 'tapicici', 'sib', 'cub', 'karb', 'kvb', 'uco', 'iob', 'pockets', 'mahb', 'allbank', 'centralbank', 'ubi', 'dlb', 'kbl']);
const SCAM_USER_WORDS = ['refund', 'support', 'helpdesk', 'care', 'lottery', 'kyc', 'prize', 'reward', 'cashback', 'customer', 'verify', 'winner', 'claim', 'official', 'service'];

export async function analyzeUpi(raw: string, ctx: Ctx, extra: Signal[] = []): Promise<Part> {
  const vpa = raw.trim().toLowerCase();
  const [user, handle = ''] = vpa.split('@');
  const signals: Signal[] = [...extra];
  const rules: number[] = [];
  if (!/^[\w.\-]{2,64}@[a-z][a-z0-9-]{1,30}$/.test(vpa)) { rules.push(0.3); signals.push(sig('bad-format', 'Not a valid UPI ID format', 0.3, 'rule')); }
  if (!KNOWN_HANDLES.has(handle)) { rules.push(0.35); signals.push(sig('unknown-handle', `"@${handle}" is not a recognised UPI bank handle`, 0.35, 'rule')); }
  if (/[-.]/.test(handle) || /\d/.test(handle)) { rules.push(0.25); signals.push(sig('odd-handle', 'Handle has hyphens/digits — real PSP handles do not', 0.25, 'rule')); }
  const w = SCAM_USER_WORDS.filter((x) => user.includes(x));
  if (w.length) { rules.push(Math.min(0.35 + 0.2 * (w.length - 1), 0.75)); signals.push(sig('scam-username', `Username contains scam bait words: ${w.join(', ')}`, 0.3, 'rule')); }
  if (/^\d{10}$/.test(user) === false && /\d{6,}/.test(user)) { rules.push(0.1); signals.push(sig('long-digits', 'Long random digit string in username', 0.1, 'rule')); }
  let p = noisyOr(0.04, ...rules);
  const key = entityKey('upi', vpa);
  const reports = await countReports(key);
  if (reports) { const wt = Math.min(0.25 * reports, 0.9); signals.push(sig('community', `${reports} community report(s) for this UPI ID`, wt, 'community')); p = noisyOr(p, wt); if (reports >= 3) p = Math.max(p, 0.6); if (reports >= 5) p = Math.max(p, 0.88); }
  const blocked = ctx.userId ? await isBlocked(ctx.userId, key) : false;
  if (blocked) { p = Math.max(p, 0.9); signals.push(sig('blocklist', 'You previously blocked this UPI ID', 0.9, 'community')); }
  if (!rules.length && !reports) signals.push(sig('no-signal', 'Format and handle look normal — this does NOT prove the person is genuine', -0.1, 'rule'));
  return { p, signals, models: [], kind: 'upi', reports, blocked };
}

/* ------------------------------------------------------------------ phone */
export async function analyzePhone(raw: string, ctx: Ctx): Promise<Part> {
  const digits = raw.replace(/\D/g, '');
  const intl = /^\s*(\+|00)/.test(raw);
  const signals: Signal[] = [];
  const rules: number[] = [];
  let local = digits;
  if (intl && digits.startsWith('91') && digits.length === 12) local = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) local = digits.slice(1);
  const indianMobile = /^[6-9]\d{9}$/.test(local) && (!intl || digits.startsWith('91'));
  if (intl && !digits.startsWith('91')) {
    const cc = digits.startsWith('00') ? digits.slice(2, 4) : digits.slice(0, 2);
    rules.push(0.4); signals.push(sig('foreign', `International number (+${cc}) — unsolicited foreign calls/WhatsApp are a common fraud channel`, 0.4, 'rule'));
  }
  if (/^140\d{7}$/.test(local) || digits.startsWith('140')) { rules.push(0.4); signals.push(sig('telemarketer', '140-series numbers are telemarketing lines (TRAI) — banks/police do not call from them', 0.4, 'rule')); }
  if (!indianMobile && !intl) { rules.push(0.3); signals.push(sig('bad-format', 'Does not match a valid Indian mobile number (10 digits starting 6-9)', 0.3, 'rule')); }
  if (/(\d)\1{5,}/.test(local)) { rules.push(0.15); signals.push(sig('repeating', 'Repeating digit pattern (often VOIP/spoofed numbers)', 0.15, 'rule')); }
  let p = noisyOr(0.05, ...rules);
  const key = entityKey('phone', raw);
  const reports = await countReports(key);
  if (reports) { const wt = Math.min(0.25 * reports, 0.9); signals.push(sig('community', `${reports} community report(s) for this number`, wt, 'community')); p = noisyOr(p, wt); if (reports >= 3) p = Math.max(p, 0.6); if (reports >= 5) p = Math.max(p, 0.88); }
  const blocked = ctx.userId ? await isBlocked(ctx.userId, key) : false;
  if (blocked) { p = Math.max(p, 0.9); signals.push(sig('blocklist', 'You previously blocked this number', 0.9, 'community')); }
  if (!rules.length && !reports) signals.push(sig('no-signal', 'Number format is normal — no public database can prove a number is safe', -0.1, 'rule'));
  return { p, signals, models: [], kind: 'phone', reports, blocked };
}

/* ------------------------------------------------------------------ free text */
export async function analyzeText(text: string, ctx: Ctx): Promise<{ part: Part; extracted: { urls: string[]; upi: string[]; phones: string[] } }> {
  const t = predictText(text);
  const signals: Signal[] = [sig('ml-text', `Message model scam probability ${(t.probability * 100).toFixed(0)}%`, t.probability, 'ml')];
  const models: ModelInfo[] = [{ name: 'Message & e-mail scam classifier', version: textModelVersion, probability: t.probability, topFeatures: t.topFeatures }];
  const urls = extractUrls(text);
  const upi = extractVpas(text);
  const phones = extractPhones(text);
  const ps = [t.probability];
  let reports = 0, blocked = false;
  for (const u of urls) {
    const r = await analyzeUrl(u, ctx);
    if (r.p >= 0.4) { signals.push(sig('embedded-url', `Embedded link ${u.slice(0, 60)} looks risky (${(r.p * 100).toFixed(0)}%)`, r.p, 'rule')); ps.push(r.p * 0.9); }
    models.push(...r.models.slice(0, 1)); reports += r.reports; blocked ||= r.blocked;
  }
  for (const v of upi) {
    const r = await analyzeUpi(v, ctx);
    if (r.p >= 0.4) { signals.push(sig('embedded-upi', `UPI ID ${v} looks risky (${(r.p * 100).toFixed(0)}%)`, r.p, 'rule')); ps.push(r.p * 0.8); }
    reports += r.reports; blocked ||= r.blocked;
  }
  for (const ph of phones) {
    const r = await analyzePhone(ph, ctx);
    if (r.p >= 0.4) { signals.push(sig('embedded-phone', `Phone ${ph} looks risky (${(r.p * 100).toFixed(0)}%)`, r.p, 'rule')); ps.push(r.p * 0.7); }
    reports += r.reports; blocked ||= r.blocked;
  }
  // a benign-looking text must not be dragged up by weak embedded signals; use max + small noisy-or bonus
  const p = Math.max(...ps) + (1 - Math.max(...ps)) * 0.15 * (ps.length > 1 ? Math.min(ps.length - 1, 3) / 3 : 0);
  return { part: { p, signals, models, kind: 'text', reports, blocked }, extracted: { urls, upi, phones } };
}

/* ------------------------------------------------------------------ QR payload */
export function parseUpiUri(payload: string): { pa?: string; pn?: string; am?: string; tn?: string } | null {
  if (!/^upi:\/\//i.test(payload)) return null;
  try {
    const q = new URL(payload.replace(/^upi:\/\//i, 'https://upi.invalid/')).searchParams;
    return { pa: q.get('pa') ?? undefined, pn: q.get('pn') ?? undefined, am: q.get('am') ?? undefined, tn: q.get('tn') ?? undefined };
  } catch { return null; }
}

/* ------------------------------------------------------------------ dispatcher */
const VPA_ONLY = /^[\w.\-]{2,64}@[a-z][a-z0-9-]{1,30}$/i;
const PHONE_ONLY = /^\+?[\d\s\-()]{8,18}$/;
const URL_ONLY = /^(?:[a-z][a-z0-9+.\-]*:\/\/)?(?:[^\s/@]+@)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]\S*)?$/i;

const ACTIONS: Record<Verdict, Record<string, string[]>> = {
  high: {
    url: ['Do NOT open the link or enter any details.', 'If you already entered a password, change it now from a trusted device.', 'If money moved, call 1930 immediately (Golden Hour).', 'Report it on cybercrime.gov.in.'],
    upi: ['Do NOT approve any collect request or send money to this ID.', 'Never enter your UPI PIN to RECEIVE money.', 'Report the ID in your UPI app and on cybercrime.gov.in.'],
    phone: ['Do not answer, call back or share OTP/PIN.', 'Block the number and report it on the Sanchar Saathi portal (Chakshu).', 'If you lost money, call 1930 at once.'],
    text: ['Do not click links, call numbers or reply.', 'Never share OTP, PIN, CVV or passwords.', 'Report the message to 1930 / cybercrime.gov.in and delete it.'],
  },
  suspicious: {
    url: ['Do not enter credentials. Type the official site address yourself or use the official app.', 'Wait for more evidence — check the domain age and who sent you the link.'],
    upi: ['Verify the payee through a trusted channel before paying.', 'Never approve unexpected collect requests.'],
    phone: ['Do not share personal or banking details on this call.', 'Call back only on the official number printed on your card/bank website.'],
    text: ['Treat as unverified: contact the organisation on its official number/app.', 'Do not click links inside the message.'],
  },
  safe: {
    url: ['No strong phishing signals found. Still check the address bar before logging in.'],
    upi: ['No red flags in the ID itself. Always confirm the payee name shown by your UPI app.'],
    phone: ['No red flags in the number format. Never share OTP/PIN with any caller.'],
    text: ['No strong scam signals found. Never share OTP, PIN or passwords regardless of the sender.'],
  },
};

export async function analyze(rawInput: string, hint: 'text' | 'phone' | 'qr' | undefined, ctx: Ctx): Promise<ScanResponse> {
  const input = rawInput.trim().slice(0, 8000);
  let part: Part;
  let kind: ScanKind;
  let extracted: ScanResponse['extracted'];
  let qrPayload: string | undefined;
  let thresholds = urlThresholds;
  let extraSummary = '';

  if (hint === 'qr') qrPayload = input;
  const upiUri = parseUpiUri(input);

  if (upiUri) {
    kind = 'qr';
    const extra: Signal[] = [];
    if (upiUri.am) extra.push(sig('qr-collect', `This QR asks you to PAY ₹${upiUri.am} — scanning a QR never RECEIVES money`, 0.45, 'rule'));
    extra.push(sig('qr-upi', 'QR contains a UPI payment request, not a website', 0.05, 'rule'));
    part = upiUri.pa ? await analyzeUpi(upiUri.pa, ctx, extra) : { p: 0.5, signals: extra, models: [], kind: 'upi', reports: 0, blocked: false };
    if (upiUri.am) part.p = noisyOr(part.p, 0.45);
    extraSummary = upiUri.pn ? ` Payee name in QR: "${upiUri.pn}" (names in QR codes are self-declared and can be faked).` : '';
  } else if (hint === 'qr' && !URL_ONLY.test(input)) {
    ({ part, extracted } = await analyzeText(input, ctx)); kind = 'qr'; thresholds = textThresholds;
  } else if (VPA_ONLY.test(input) && !/\.[a-z]{2,}$/i.test(input.split('@')[1] ?? '')) {
    part = await analyzeUpi(input, ctx); kind = 'upi';
  } else if (hint !== 'text' && PHONE_ONLY.test(input) && input.replace(/\D/g, '').length >= 10) {
    part = await analyzePhone(input, ctx); kind = 'phone';
  } else if (!/\s/.test(input) && URL_ONLY.test(input)) {
    part = await analyzeUrl(input, ctx); kind = hint === 'qr' ? 'qr' : 'url';
  } else {
    ({ part, extracted } = await analyzeText(input, ctx)); kind = 'text'; thresholds = textThresholds;
  }

  const verdict = verdictOf(part.p, thresholds);
  const score = Math.round(part.p * 100);
  const actionKind = kind === 'qr' ? (upiUri ? 'upi' : 'url') : kind;
  const top = [...part.signals].filter((s) => s.weight > 0.05).sort((a, b) => b.weight - a.weight);
  const reasons = (top.length ? top : part.signals).slice(0, 6).map((s) => s.label);
  const summary =
    (verdict === 'high' ? 'High risk — treat this as a scam.' : verdict === 'suspicious' ? 'Suspicious — verify independently before acting.' : 'No strong scam indicators found.') + extraSummary;

  const res: ScanResponse = {
    id: 'scan-' + randomUUID().slice(0, 8), kind, input: input.slice(0, 500), verdict, score, summary, reasons,
    signals: part.signals, models: part.models, communityReports: part.reports, blocked: part.blocked,
    recommendedActions: ACTIONS[verdict][actionKind] ?? ACTIONS[verdict]['text'],
    extracted, qrPayload, generatedAt: new Date().toISOString(),
  };
  await addScan({ id: res.id, ts: res.generatedAt, kind, verdict, score, userId: ctx.userId });
  return res;
}

/** Best-effort live enrichment (RDAP domain age). Network failures leave the result untouched. */
export async function enrichWithDomainAge(res: ScanResponse): Promise<ScanResponse> {
  if (!(res.kind === 'url' || (res.kind === 'qr' && !res.qrPayload?.startsWith('upi://')))) return res;
  const host = hostOf(res.qrPayload ?? res.input);
  const rep = reputationOf(host);
  if (rep.trusted || (rep.rank && !rep.hostingPlatform) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return res;
  const info = await rdapLookup(rep.registered);
  if (!info?.created) return res;
  const days = Math.floor((Date.now() - Date.parse(info.created)) / 86400000);
  let p = res.score / 100;
  const hasReports = res.communityReports > 0 || res.blocked;
  const strongRules = res.signals.some((x) => x.kind === 'rule' && x.weight >= 0.35);
  if (days < 30) { res.signals.push(sig('domain-new', `Domain registered only ${days} day(s) ago`, 0.4, 'rule')); p = noisyOr(p, 0.4); }
  else if (days < 180) { res.signals.push(sig('domain-young', `Domain is only ${days} days old`, 0.15, 'rule')); p = noisyOr(p, 0.15); }
  else if (days > 730 && !strongRules && !hasReports) { res.signals.push(sig('domain-old', `Domain has existed for ${(days / 365).toFixed(1)} years (since ${info.created.slice(0, 10)})`, -0.5, 'reputation')); p *= 0.5; }
  const t = urlThresholds;
  res.score = Math.round(p * 100);
  res.verdict = verdictOf(p, t);
  res.reasons = [...res.signals].filter((x) => x.weight > 0.05).sort((a, b) => b.weight - a.weight).slice(0, 6).map((x) => x.label);
  if (!res.reasons.length) res.reasons = res.signals.slice(0, 3).map((x) => x.label);
  res.summary = res.verdict === 'high' ? 'High risk — treat this as a scam.' : res.verdict === 'suspicious' ? 'Suspicious — verify independently before acting.' : 'No strong scam indicators found.';
  res.recommendedActions = ACTIONS[res.verdict]['url'];
  return res;
}

const rdapCache = new Map<string, { at: number; v: { created?: string } | null }>();
async function rdapLookup(domain: string): Promise<{ created?: string } | null> {
  const hit = rdapCache.get(domain);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v;
  let v: { created?: string } | null = null;
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(4000), headers: { accept: 'application/rdap+json' } });
    if (r.ok) {
      const j = (await r.json()) as { events?: { eventAction: string; eventDate: string }[] };
      v = { created: j.events?.find((e) => e.eventAction === 'registration')?.eventDate };
    }
  } catch { /* offline / rate-limited: skip enrichment */ }
  rdapCache.set(domain, { at: Date.now(), v });
  return v;
}

export { BRANDS, hostOf };
