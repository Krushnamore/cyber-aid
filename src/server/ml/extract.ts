export const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;
const BARE_RE = /\b[a-z0-9][a-z0-9-]{1,60}(?:\.[a-z0-9-]{2,30})*\.(?:com|in|net|org|xyz|top|click|online|site|icu|live|vip|cc|buzz|co|info|biz|me|link|app|shop|store|gov\.in|co\.in)\b(?:\/[^\s<>"')\]]*)?/gi;
export const VPA_RE = /\b[\w.\-]{2,64}@[a-z][a-z0-9]{1,20}(?:-[a-z0-9]{1,15})?\b(?!\.[a-z])/gi;
export const PHONE_RE = /(?:\+|00)?\d[\d\s\-()]{8,16}\d/g;

export function extractUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(URL_RE) ?? []) found.add(m.replace(/[.,;:!?]+$/, ''));
  const noEmails = text.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, ' ');
  for (const m of noEmails.match(BARE_RE) ?? []) {
    const t = m.replace(/[.,;:!?]+$/, '');
    if (![...found].some((f) => f.includes(t))) found.add(t);
  }
  return [...found].slice(0, 15);
}

export function extractVpas(text: string): string[] {
  return [...new Set((text.match(VPA_RE) ?? []).map((v) => v.toLowerCase()))].slice(0, 10);
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(PHONE_RE) ?? []) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) out.add(m.trim());
  }
  return [...out].slice(0, 10);
}

export function hostOf(url: string): string {
  let s = url.trim().toLowerCase().replace(/^[a-z][a-z0-9+.\-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  if (s.includes('@')) s = s.split('@').pop()!;
  return s.replace(/:\d+$/, '').replace(/^www\./, '');
}
