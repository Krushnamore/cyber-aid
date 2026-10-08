import model from './models/text-model.json';
import type { FeatureContribution, ModelCard } from '../../shared/api-types';

interface TextModel {
  version: string;
  terms: string[];
  idf: number[];
  coef: number[];
  intercept: number;
  thresholds: { suspicious: number; high: number };
  training: { sources: Record<string, number>; C: number; n_features: number };
  metrics: Record<string, unknown>;
  note?: string;
}

const M = model as unknown as TextModel;
const INDEX = new Map<string, number>();
M.terms.forEach((t, i) => INDEX.set(t, i));

/** MUST stay identical to preprocess() in ml/train_text.py */
export function preprocessText(t: string): string {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, ' urltoken ')
    .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, ' emailtoken ')
    .replace(/\d{6,}/g, ' bignum ');
}

export function ngrams(text: string): string[] {
  const tokens = preprocessText(text).match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  const out: string[] = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + ' ' + tokens[i + 1]);
  return out;
}

export interface TextPrediction {
  probability: number;
  topFeatures: FeatureContribution[];
  coverage: number;
}

export function predictText(text: string): TextPrediction {
  const counts = new Map<number, number>();
  const grams = ngrams(text);
  for (const g of grams) {
    const idx = INDEX.get(g);
    if (idx !== undefined) counts.set(idx, (counts.get(idx) ?? 0) + 1);
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
    contribs.push({ feature: M.terms[idx], contribution: c });
  }
  contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    probability: 1 / (1 + Math.exp(-z)),
    topFeatures: contribs.slice(0, 8).map((c) => ({ feature: c.feature, contribution: +c.contribution.toFixed(4) })),
    coverage: grams.length ? vals.size / grams.length : 0,
  };
}

export const textThresholds = M.thresholds;
export const textModelVersion = M.version;

export function textModelCard(): ModelCard {
  return {
    name: 'Message & e-mail scam classifier',
    version: M.version,
    algorithm: 'TF-IDF (word 1-2 grams) + L2 logistic regression',
    trainedOn: M.training.sources,
    metrics: M.metrics,
    note: M.note,
  };
}
