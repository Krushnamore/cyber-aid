import model from './models/url-model.json';
import type { FeatureContribution, ModelCard } from '../../shared/api-types';

interface UrlModel {
  version: string;
  ngrams: string[];
  idf: number[];
  coef: number[];
  numeric: { names: string[]; mean: number[]; scale: number[]; coef: number[] };
  intercept: number;
  thresholds: { suspicious: number; high: number };
  training: { phishing: number; benign: number; sources: Record<string, number> };
  metrics: Record<string, unknown>;
  note?: string;
}

const M = model as unknown as UrlModel;
const INDEX = new Map<string, number>();
M.ngrams.forEach((t, i) => INDEX.set(t, i));
const SLD = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'nic', 'res']);

/** MUST stay identical to ml/url_features.py */
export function normalizeUrl(u: string): string {
  let n = u.trim().toLowerCase().replace(/\s+/g, '');
  n = n.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '').replace(/^www\./, '');
  n = Array.from(n).slice(0, 200).join('');
  if (n.endsWith('/') && n.split('/').length - 1 === 1) n = n.slice(0, -1);
  return n;
}

export function splitHostPath(n: string): { host: string; rest: string } {
  const m = /^([^/?#]*)([\s\S]*)$/.exec(n)!;
  let host = m[1];
  if (host.includes('@')) host = host.split('@').pop()!;
  host = host.replace(/:\d+$/, '');
  return { host, rest: m[2] };
}

export function registeredDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  if (parts[parts.length - 1].length === 2 && SLD.has(parts[parts.length - 2])) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

function entropy(s: string): number {
  if (!s) return 0;
  const c = new Map<string, number>();
  for (const ch of s) c.set(ch, (c.get(ch) ?? 0) + 1);
  const n = Array.from(s).length;
  let e = 0;
  for (const v of c.values()) e -= (v / n) * Math.log2(v / n);
  return e;
}

const digits = (s: string) => (s.match(/[0-9]/g) ?? []).length;

export function numericFeatures(n: string): number[] {
  const { host, rest } = splitHostPath(n);
  const path = /^[^?#]*/.exec(rest)![0];
  const qm = /\?([^#]*)/.exec(rest);
  const nParams = qm && qm[1] ? (qm[1].match(/&/g) ?? []).length + 1 : 0;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? 1 : 0;
  const hl = Math.max(Array.from(host).length, 1);
  const nl = Math.max(Array.from(n).length, 1);
  return [
    Math.log1p(Array.from(n).length),
    Math.log1p(Array.from(host).length),
    (host.match(/\./g) ?? []).length,
    (host.match(/-/g) ?? []).length,
    digits(host) / hl,
    Math.max(0, (host.match(/\./g) ?? []).length - 1),
    isIp,
    n.split('/')[0].includes('@') ? 1 : 0,
    Math.log1p(Array.from(path).length),
    nParams,
    entropy(host),
    host.includes('xn--') ? 1 : 0,
    digits(n) / nl,
  ];
}

export interface UrlPrediction {
  probability: number;
  topFeatures: FeatureContribution[];
}

export function predictUrl(url: string): UrlPrediction {
  const n = normalizeUrl(url);
  const chars = Array.from(n);
  const counts = new Map<number, number>();
  for (let k = 3; k <= 5; k++) {
    for (let i = 0; i + k <= chars.length; i++) {
      const idx = INDEX.get(chars.slice(i, i + k).join(''));
      if (idx !== undefined) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
  }
  let norm = 0;
  const vals = new Map<number, number>();
  for (const [idx, tf] of counts) {
    const v = (1 + Math.log(tf)) * M.idf[idx];
    vals.set(idx, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  let z = M.intercept;
  const contribs: FeatureContribution[] = [];
  for (const [idx, v] of vals) {
    const c = (M.coef[idx] * v) / norm;
    z += c;
    contribs.push({ feature: `"${M.ngrams[idx]}"`, contribution: c });
  }
  const nums = numericFeatures(n);
  nums.forEach((x, i) => {
    const c = ((x - M.numeric.mean[i]) / M.numeric.scale[i]) * M.numeric.coef[i];
    z += c;
    contribs.push({ feature: M.numeric.names[i], contribution: c });
  });
  contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    probability: 1 / (1 + Math.exp(-z)),
    topFeatures: contribs.slice(0, 6).map((c) => ({ feature: c.feature, contribution: +c.contribution.toFixed(4) })),
  };
}

export const urlModelVersion = M.version;
export const urlThresholds = M.thresholds;

export function urlModelCard(): ModelCard {
  return {
    name: 'URL phishing classifier',
    version: M.version,
    algorithm: 'Character 3-5-gram TF-IDF + 13 lexical features + L2 logistic regression',
    trainedOn: { phishing_urls: M.training.phishing, benign_urls: M.training.benign, ...M.training.sources },
    metrics: M.metrics,
    note: M.note,
  };
}
