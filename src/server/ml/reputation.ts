import top from './models/top-domains.json';
import { registeredDomain } from './url-classifier';

const TOP: string[] = (top as { domains: string[] }).domains;
const RANK = new Map<string, number>();
TOP.forEach((d, i) => RANK.set(d, i + 1));

/** Shared hosting / free site builders: a reputable registered domain here says nothing about the sub-site. */
const HOSTING = new Set([
  'web.app', 'firebaseapp.com', 'weebly.com', 'wixsite.com', 'blogspot.com', 'github.io', 'netlify.app', 'vercel.app',
  'pages.dev', 'workers.dev', 'herokuapp.com', 'glitch.me', '000webhostapp.com', 'godaddysites.com', 'webflow.io',
  'wordpress.com', 'sites.google.com', 'myshopify.com', 'square.site', 'carrd.co', 'surge.sh', 'repl.co', 'replit.app',
  'onrender.com', 'framer.app', 'ngrok.io', 'ngrok-free.app', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
  'run.goorm.io', 'weeblysite.com', 'yolasite.com', 'jimdosite.com', 'site123.me', 'mystrikingly.com', 'tiiny.site',
  'duckdns.org', 'no-ip.org', 'ddns.net', 'bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 't.co', 'is.gd', 'ow.ly',
]);

export const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 't.co', 'is.gd', 'goo.gl', 'ow.ly', 'shorturl.at', 'tiny.cc', 'rebrand.ly', 'bl.ink', 'lnkd.in']);

export const RISKY_TLDS = new Set(['xyz', 'top', 'click', 'online', 'site', 'icu', 'live', 'vip', 'cc', 'buzz', 'gq', 'tk', 'ml', 'ga', 'cf', 'work', 'support', 'loan', 'zip', 'mov', 'rest', 'cyou', 'monster', 'sbs', 'link', 'cam', 'country', 'stream', 'download', 'review']);

/** Official domains of brands that are heavily impersonated in India. */
export const BRANDS: Record<string, { label: string; keywords: string[]; domains: string[] }> = {
  sbi: { label: 'State Bank of India', keywords: ['sbi', 'onlinesbi', 'yono'], domains: ['onlinesbi.sbi', 'sbi.co.in', 'sbi.bank.in', 'onlinesbi.com', 'sbicard.com', 'sbilife.co.in', 'sbimf.com', 'yonosbi.com'] },
  hdfc: { label: 'HDFC Bank', keywords: ['hdfc'], domains: ['hdfcbank.com', 'hdfc.com', 'hdfcbank.net', 'hdfclife.com', 'hdfcergo.com', 'hdfcsec.com'] },
  icici: { label: 'ICICI Bank', keywords: ['icici'], domains: ['icicibank.com', 'icicilombard.com', 'iciciprulife.com', 'icicidirect.com', 'icicisecurities.com'] },
  axis: { label: 'Axis Bank', keywords: ['axisbank', 'axis-bank'], domains: ['axisbank.com', 'axis.bank.in'] },
  kotak: { label: 'Kotak Mahindra Bank', keywords: ['kotak'], domains: ['kotak.com', 'kotak.bank.in'] },
  pnb: { label: 'Punjab National Bank', keywords: ['pnbindia', 'pnb-'], domains: ['pnbindia.in', 'netpnb.com', 'pnb.bank.in'] },
  bob: { label: 'Bank of Baroda', keywords: ['bankofbaroda', 'bobworld'], domains: ['bankofbaroda.in', 'bankofbaroda.com', 'bobibanking.com'] },
  canara: { label: 'Canara Bank', keywords: ['canarabank'], domains: ['canarabank.com', 'canarabank.in'] },
  paytm: { label: 'Paytm', keywords: ['paytm'], domains: ['paytm.com', 'paytmbank.com', 'paytmmall.com'] },
  phonepe: { label: 'PhonePe', keywords: ['phonepe'], domains: ['phonepe.com'] },
  gpay: { label: 'Google Pay', keywords: ['googlepay', 'gpay'], domains: ['google.com', 'pay.google.com', 'gpay.app.goo.gl'] },
  npci: { label: 'NPCI / BHIM', keywords: ['npci', 'bhimupi'], domains: ['npci.org.in', 'bhimupi.org.in'] },
  amazon: { label: 'Amazon', keywords: ['amazon'], domains: ['amazon.in', 'amazon.com', 'amazon.co.uk', 'amazonaws.com', 'amazon.jobs', 'primevideo.com', 'amazonpay.in'] },
  flipkart: { label: 'Flipkart', keywords: ['flipkart'], domains: ['flipkart.com', 'flipkart.in'] },
  netflix: { label: 'Netflix', keywords: ['netflix'], domains: ['netflix.com'] },
  google: { label: 'Google', keywords: ['google', 'gmail'], domains: ['google.com', 'gmail.com', 'google.co.in', 'googleapis.com', 'withgoogle.com', 'youtube.com', 'goo.gl', 'googlemail.com'] },
  microsoft: { label: 'Microsoft', keywords: ['microsoft', 'office365', 'outlook-', 'onedrive'], domains: ['microsoft.com', 'office.com', 'live.com', 'microsoftonline.com', 'outlook.com', 'office365.com', 'sharepoint.com', 'onedrive.com', 'windows.net'] },
  paypal: { label: 'PayPal', keywords: ['paypal'], domains: ['paypal.com', 'paypal.me'] },
  apple: { label: 'Apple', keywords: ['apple-id', 'appleid', 'icloud'], domains: ['apple.com', 'icloud.com'] },
  whatsapp: { label: 'WhatsApp', keywords: ['whatsapp'], domains: ['whatsapp.com', 'whatsapp.net', 'wa.me'] },
  facebook: { label: 'Facebook / Meta', keywords: ['facebook'], domains: ['facebook.com', 'fb.com', 'meta.com', 'fb.me'] },
  instagram: { label: 'Instagram', keywords: ['instagram'], domains: ['instagram.com'] },
  irctc: { label: 'IRCTC', keywords: ['irctc'], domains: ['irctc.co.in', 'irctc.com'] },
  uidai: { label: 'UIDAI / Aadhaar', keywords: ['uidai', 'aadhaar', 'aadhar'], domains: ['uidai.gov.in', 'myaadhaar.uidai.gov.in'] },
  incometax: { label: 'Income Tax Dept', keywords: ['incometax', 'income-tax', 'efiling'], domains: ['incometax.gov.in', 'incometaxindia.gov.in'] },
  epfo: { label: 'EPFO', keywords: ['epfo', 'epfindia'], domains: ['epfindia.gov.in', 'epfo.gov.in'] },
  mahadiscom: { label: 'MSEDCL (Mahavitaran)', keywords: ['mahavitaran', 'mahadiscom', 'msedcl'], domains: ['mahadiscom.in', 'mahavitaran.com'] },
  jio: { label: 'Jio', keywords: ['jio'], domains: ['jio.com', 'ril.com'] },
  airtel: { label: 'Airtel', keywords: ['airtel'], domains: ['airtel.in', 'airtel.com'] },
  fedex: { label: 'FedEx / DHL / India Post', keywords: ['fedex', 'dhl', 'indiapost', 'bluedart'], domains: ['fedex.com', 'dhl.com', 'indiapost.gov.in', 'bluedart.com'] },
  rbi: { label: 'Reserve Bank of India', keywords: ['rbi'], domains: ['rbi.org.in', 'rbi.gov.in'] },
};

const GOV_SUFFIX = ['.gov.in', '.nic.in', '.gov', '.mil'];
const TRUSTED = new Set(Object.values(BRANDS).flatMap((b) => b.domains).concat(['cybercrime.gov.in', 'wikipedia.org', 'github.com', 'irctc.co.in']));

export interface Reputation {
  registered: string;
  rank: number | null;
  trusted: boolean;
  hostingPlatform: boolean;
  isGov: boolean;
}

export function reputationOf(host: string): Reputation {
  const reg = registeredDomain(host);
  const isGov = GOV_SUFFIX.some((s) => host.endsWith(s));
  return {
    registered: reg,
    rank: RANK.get(reg) ?? null,
    trusted: TRUSTED.has(reg) || isGov,
    hostingPlatform: HOSTING.has(reg) || HOSTING.has(host.split('.').slice(-3).join('.')),
    isGov,
  };
}

/* ---------------- impersonation detection ---------------- */
const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '5': 's', '4': 'a', '@': 'a', '$': 's' };
const deLeet = (s: string) => s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[01345@$]/g, (c) => LEET[c] ?? c);

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export interface Impersonation {
  type: 'brand-in-host' | 'typosquat' | 'homoglyph';
  brand: string;
  detail: string;
}

export function detectImpersonation(host: string): Impersonation | null {
  const rep = reputationOf(host);
  const reg = rep.registered;
  if (rep.trusted) return null;
  const label = reg.split('.')[0];
  const tokens = host.split(/[.\-_0-9]+/).filter(Boolean);
  for (const b of Object.values(BRANDS)) {
    if (b.domains.includes(reg)) return null;
  }
  const labelParts = label.split('-').filter(Boolean);
  for (const b of Object.values(BRANDS)) {
    // homoglyph / typo-squat of an official label
    for (const d of b.domains) {
      const official = d.split('.')[0];
      if (official.length < 5 || label === official) continue;
      if (deLeet(label) === official && label !== official) return { type: 'homoglyph', brand: b.label, detail: `"${label}" imitates "${official}" with look-alike characters` };
      const part = labelParts.find((x) => x !== official && deLeet(x) === official);
      if (part) return { type: 'homoglyph', brand: b.label, detail: `"${part}" imitates "${official}" with look-alike characters` };
      if (Math.abs(label.length - official.length) <= 1 && levenshtein(label, official) === 1) return { type: 'typosquat', brand: b.label, detail: `"${reg}" is one character away from ${d}` };
    }
    for (const k of b.keywords) {
      const hit = k.length >= 5 ? host.includes(k) : tokens.includes(k);
      if (hit) return { type: 'brand-in-host', brand: b.label, detail: `Mentions ${b.label} but is not an official ${b.label} domain (${reg})` };
    }
  }
  return null;
}

export const SUSPICIOUS_PATH_WORDS = ['login', 'signin', 'verify', 'kyc', 'update', 'secure', 'account', 'password', 'otp', 'claim', 'reward', 'refund', 'confirm', 'suspend', 'unlock', 'wallet'];
