/**
 * National cyber-crime statistics for the Analytics dashboard.
 *
 * DESIGN (why Grok is NOT the source of the numbers):
 *  - Language models cannot reliably recall official statistics; they invent plausible-looking figures.
 *  - So every number below is an OFFICIAL / government-sourced figure with a citation (origin: 'official').
 *  - Grok/Groq is used for what an LLM is actually good at, always labelled origin: 'ai':
 *      1. a short plain-language trend commentary written ONLY from the official figures supplied to it,
 *      2. a "dominant scam type" label for each state (no official state-wise breakdown exists).
 *  - AI output never overwrites an official value and is cached on disk (refresh via POST /api/analytics/refresh).
 */
import { kvGet, kvSet } from './repo';
import { complete, llmEnabled, llmProvider, parseJsonLoose } from './llm';

export type Origin = 'official' | 'derived' | 'ai';

export interface YearRow {
  year: string;
  /** complaints / incidents reported on NCRP (cybercrime.gov.in) */
  complaints: number | null;
  /** cyber-crime cases registered as police cases (NCRB "Crime in India") */
  registeredCases: number | null;
  /** reported financial-fraud losses, ₹ crore (NCRP + CFCFRMS) */
  lossCrores: number | null;
  /** FIRs registered from NCRP complaints */
  firs: number | null;
  origin: { complaints: Origin; registeredCases: Origin; lossCrores: Origin; firs: Origin };
}

export interface StateRow { state: string; cases2024: number; cases2023: number; dominantScam: string | null; dominantScamOrigin: Origin | null }
export interface Category { name: string; pct: number; origin: Origin }

export interface NationalData {
  years: YearRow[];
  states: StateRow[];
  /** share of NCRP cases by fraud type in 2025 (MHA data) */
  categories2025: Category[];
  /** Citizen Financial Cyber Fraud Reporting & Management System (CFCFRMS), cumulative */
  fundsSaved: { crores: number; complaints: string; asOf: string; crores2025: number; totalReported2021to2025: number };
  commentary: { text: string; origin: 'ai'; provider: string; generatedAt: string } | null;
  sources: { label: string; url: string }[];
  notes: string[];
}

const O = 'official' as const, D = 'derived' as const;
const row = (year: string, complaints: number | null, registeredCases: number | null, lossCrores: number | null, firs: number | null,
  o: Partial<YearRow['origin']> = {}): YearRow => ({ year, complaints, registeredCases, lossCrores, firs, origin: { complaints: O, registeredCases: O, lossCrores: O, firs: O, ...o } });

/** Official figures. Every value has a source in `sources`. null = not published (never guessed). */
const OFFICIAL: Omit<NationalData, 'commentary'> = {
  years: [
    row('2021', 452429, 52974, 563.58, 11304, { lossCrores: D }),
    row('2022', 1029026, 65893, 2290.24, 21379),
    row('2023', 1596491, 86420, 7465.18, null),
    row('2024', 2268346, 101928, 22845.73, 66370),
    row('2025', 2815000, null, 22495, 55484),
  ],
  states: [
    { state: 'Telangana', cases2024: 27230, cases2023: 18236, dominantScam: null, dominantScamOrigin: null },
    { state: 'Karnataka', cases2024: 21993, cases2023: 21889, dominantScam: null, dominantScamOrigin: null },
    { state: 'Uttar Pradesh', cases2024: 11073, cases2023: 10794, dominantScam: null, dominantScamOrigin: null },
    { state: 'Maharashtra', cases2024: 9922, cases2023: 8103, dominantScam: null, dominantScamOrigin: null },
    { state: 'Bihar', cases2024: 6380, cases2023: 4450, dominantScam: null, dominantScamOrigin: null },
    { state: 'Tamil Nadu', cases2024: 5793, cases2023: 4121, dominantScam: null, dominantScamOrigin: null },
  ],
  categories2025: [
    { name: 'Investment fraud', pct: 35, origin: O },
    { name: 'Sextortion', pct: 19, origin: O },
    { name: 'Digital arrest', pct: 6, origin: O },
    { name: 'Other cyber frauds', pct: 40, origin: D },
  ],
  fundsSaved: { crores: 11158, complaints: '32.80 lakh', asOf: '30 Jun 2026', crores2025: 8189, totalReported2021to2025: 55050 },
  sources: [
    { label: 'Lok Sabha USQ 251 (21 Jul 2026): NCRB state-wise cases 2020-24; NCRP/CFCFRMS totals 2021-25', url: 'https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU251_hTDkTd.pdf' },
    { label: 'Rajya Sabha USQ 1349 (11 Feb 2026): CFCFRMS ₹8,189 Cr saved till 31.12.2025', url: 'https://www.mha.gov.in/MHA1/Par2017/pdfs/par2026-pdfs/RS11022026/1349.pdf' },
    { label: 'Lok Sabha (22 Jul 2025): financial-fraud complaints & amounts 2023-24 (via The420.in summary of NCRP data)', url: 'https://the420.in/india-cybercrime-surge-ncrp-data-rising-fraud-losses-2024/' },
    { label: 'MHA data on 2025 (28.15 lakh cases, ₹22,495 Cr, 55,484 FIRs; case mix) — ThePrint', url: 'https://theprint.in/india/cybercrime-saw-24-spike-in-2025-indians-lost-rs-22495-crore-mainly-in-investment-scams/2859930/' },
    { label: 'I4C press conference (Jan 2024): ₹10,319 Cr lost Apr 2021-Dec 2023 — Deccan Herald', url: 'https://www.deccanherald.com/amp/story/india%2Fover-rs-10300-crore-siphoned-off-by-cyber-criminals-since-2021-i4c-2834356' },
  ],
  notes: [
    '2021 loss (₹563.58 Cr) is derived: I4C total for Apr 2021-Dec 2023 (₹10,319 Cr) minus the 2022 and 2023 official figures; it covers Apr-Dec 2021 only.',
    '2025 figures are "at least" values reported from MHA data; the 2025 NCRB case count is not yet published.',
    'Year-wise "funds saved" is not published; only cumulative CFCFRMS totals exist, so the dashboard shows the cumulative figure.',
    'There is no official state-wise breakdown of scam types; those labels are AI-generated and marked as such.',
  ],
};

const KV_KEY = 'national-ai-cache';

interface AiCache {
  generatedAt: string; provider: string;
  states: Record<string, string>;
  commentary: string;
}

async function readCache(): Promise<AiCache | null> {
  try { const v = await kvGet(KV_KEY); return v ? (JSON.parse(v) as AiCache) : null; } catch { return null; }
}

export async function getNational(): Promise<NationalData & { ai: { enabled: boolean; provider: string | null; generatedAt: string | null } }> {
  const c = await readCache();
  const data: NationalData = JSON.parse(JSON.stringify({ ...OFFICIAL, commentary: null }));
  if (c) {
    for (const s of data.states) {
      const label = c.states[s.state];
      if (label) { s.dominantScam = label; s.dominantScamOrigin = 'ai'; }
    }
    data.commentary = { text: c.commentary, origin: 'ai', provider: c.provider, generatedAt: c.generatedAt };
  }
  return { ...data, ai: { enabled: llmEnabled(), provider: llmProvider(), generatedAt: c?.generatedAt ?? null } };
}

let refreshing = false;

/** Asks Grok/Groq for commentary + state scam labels. Numbers are passed IN as ground truth; none are accepted OUT. */
export async function refreshWithLlm(): Promise<{ ok: boolean; message: string }> {
  if (!llmEnabled()) return { ok: false, message: 'No GROK_API_KEY configured' };
  if (refreshing) return { ok: false, message: 'Refresh already running' };
  refreshing = true;
  try {
    const facts = {
      ncrp_complaints_by_year: Object.fromEntries(OFFICIAL.years.map((y) => [y.year, y.complaints])),
      reported_loss_crore_by_year: Object.fromEntries(OFFICIAL.years.map((y) => [y.year, y.lossCrores])),
      ncrb_registered_cases_by_year: Object.fromEntries(OFFICIAL.years.map((y) => [y.year, y.registeredCases])),
      firs_by_year: Object.fromEntries(OFFICIAL.years.map((y) => [y.year, y.firs])),
      case_mix_2025_percent: Object.fromEntries(OFFICIAL.categories2025.map((c) => [c.name, c.pct])),
      cfcfrms_saved_crore_till_dec_2025: OFFICIAL.fundsSaved.crores2025,
      states_ncrb_cases_2023_2024: OFFICIAL.states.map((s) => ({ state: s.state, y2023: s.cases2023, y2024: s.cases2024 })),
    };
    const text = await complete({
      json: true, maxTokens: 700, temperature: 0.3,
      messages: [
        { role: 'system', content: 'You write short, factual explanations of Indian cyber-crime statistics for a public awareness dashboard. Use ONLY the numbers in the JSON the user gives you; never introduce other statistics. Respond with JSON only.' },
        { role: 'user', content: `FACTS:\n${JSON.stringify(facts)}\n\nReturn JSON: {"commentary": "<3-4 sentences, plain English, mention the growth trend, the loss trend, the low FIR share and that investment fraud dominates 2025 losses/cases>", "states": {"<state name>": "<at most 5 words: the cyber-fraud type most associated with that state in public reporting, or 'Mixed / not clear'>"}} for exactly these states: ${OFFICIAL.states.map((s) => s.state).join(', ')}.` },
      ],
    });
    const j = parseJsonLoose<{ commentary?: string; states?: Record<string, string> }>(text);
    const commentary = String(j.commentary ?? '').trim().slice(0, 900);
    if (commentary.length < 40) throw new Error('commentary too short');
    const states: Record<string, string> = {};
    for (const s of OFFICIAL.states) {
      const v = String(j.states?.[s.state] ?? '').trim().slice(0, 40);
      if (v) states[s.state] = v;
    }
    const cache: AiCache = { generatedAt: new Date().toISOString(), provider: llmProvider() ?? 'llm', states, commentary };
    await kvSet(KV_KEY, JSON.stringify(cache));
    return { ok: true, message: 'Refreshed' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  } finally { refreshing = false; }
}

/** Generates the cache once in the background on first request when a key exists. */
export async function ensureAiCache() {
  if (llmEnabled() && !refreshing && !(await readCache())) void refreshWithLlm().then((r) => { if (!r.ok) console.warn('[national] AI refresh failed:', r.message); });
}
