// Verifies the TypeScript inference matches scikit-learn (run: npm run test:ml)
import { readFileSync } from 'node:fs';
import { predictText } from '../src/server/ml/text-classifier';
import { predictUrl } from '../src/server/ml/url-classifier';

let worst = 0, bad = 0;
const t = JSON.parse(readFileSync('ml/parity_text.json', 'utf8')) as { text: string; p: number }[];
for (const r of t) { const d = Math.abs(predictText(r.text).probability - r.p); worst = Math.max(worst, d); if (d > 1e-4) { bad++; console.log('TEXT DIFF', d.toFixed(5), r.text.slice(0, 60)); } }
console.log(`text: ${t.length} fixtures, max |diff| = ${worst.toExponential(2)}`);
worst = 0;
const u = JSON.parse(readFileSync('ml/parity_url.json', 'utf8')) as { url: string; p: number }[];
for (const r of u) { const d = Math.abs(predictUrl(r.url).probability - r.p); worst = Math.max(worst, d); if (d > 1e-4) { bad++; console.log('URL DIFF', d.toFixed(5), r.url.slice(0, 80)); } }
console.log(`url : ${u.length} fixtures, max |diff| = ${worst.toExponential(2)}`);
if (bad) { console.error(`PARITY FAILED (${bad})`); process.exit(1); } else console.log('PARITY OK');
