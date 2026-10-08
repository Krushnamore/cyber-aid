import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth';
import { ApiService } from './api';
import { MLForensicService } from './ml-forensic';
import type { EmailBatchItem, EmailInput } from '../../shared/api-types';

export interface EmailThreatReport {
  id: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  status: 'HARMFUL' | 'SUSPICIOUS' | 'SAFE';
  score: number;
  threatCategory: string;
  reasons: string[];
  extractedLinks: string[];
  recommendedAction: string;
}

interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
interface GmailMessage { id: string; snippet?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } }

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

function b64url(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function extractBody(part: GmailPart | undefined): string {
  if (!part) return '';
  const plain: string[] = [], html: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.body?.data && p.mimeType === 'text/plain') plain.push(b64url(p.body.data));
    else if (p.body?.data && p.mimeType === 'text/html') html.push(b64url(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plain.length) return plain.join('\n').slice(0, 20000);
  // keep href targets: they are what the URL model needs
  return html.join('\n').replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' $1 ').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 20000);
}

@Injectable({ providedIn: 'root' })
export class GmailService {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private ml = inject(MLForensicService);

  isScanning = signal(false);
  scannedEmails = signal<EmailThreatReport[]>([]);
  lastScanTime = signal<string | null>(null);
  source = signal<'gmail' | 'sample' | null>(null);
  error = signal('');
  private inputs = new Map<string, EmailInput>();

  private toReport(i: EmailBatchItem): EmailThreatReport {
    return {
      id: i.id, sender: i.sender, subject: i.subject, date: i.date === '—' ? '' : (isNaN(Date.parse(i.date)) ? i.date : new Date(i.date).toLocaleString()),
      snippet: i.snippet, status: i.verdict === 'HIGH' ? 'HARMFUL' : i.verdict === 'MEDIUM' ? 'SUSPICIOUS' : 'SAFE', score: i.score,
      threatCategory: i.category, reasons: i.reasons, extractedLinks: i.links, recommendedAction: i.recommendedAction,
    };
  }

  private async analyse(list: (EmailInput & { id: string })[]) {
    const { items } = await this.api.post<{ items: EmailBatchItem[] }>('/scan/email-batch', { emails: list });
    list.forEach((e) => this.inputs.set(e.id, e));
    this.scannedEmails.set(items.map((i) => this.toReport(i)).sort((a, b) => b.score - a.score));
    this.lastScanTime.set(new Date().toLocaleTimeString());
  }

  /** Reads the latest inbox messages through the Gmail API (read-only scope) and analyses them on the server. */
  async scanInbox(): Promise<void> {
    this.error.set('');
    const token = this.auth.getAccessToken();
    if (!token) { this.error.set('Connect your Gmail account first.'); return; }
    this.isScanning.set(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const listRes = await fetch(`${GMAIL}/messages?maxResults=15&labelIds=INBOX`, { headers });
      if (listRes.status === 401 || listRes.status === 403) {
        this.auth.hasGmailAccess.set(false);
        throw new Error(listRes.status === 401 ? 'Gmail session expired. Reconnect Gmail.' : 'Gmail permission was not granted. Reconnect and allow read-only access.');
      }
      if (!listRes.ok) throw new Error(`Gmail returned ${listRes.status}.`);
      const ids: { id: string }[] = (await listRes.json()).messages ?? [];
      if (!ids.length) { this.scannedEmails.set([]); this.source.set('gmail'); this.lastScanTime.set(new Date().toLocaleTimeString()); return; }
      const msgs = await Promise.all(ids.map(async ({ id }) => {
        const r = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers });
        return r.ok ? ((await r.json()) as GmailMessage) : null;
      }));
      const list = msgs.filter((m): m is GmailMessage => !!m).map((m) => ({
        id: m.id, headers: m.payload?.headers ?? [], body: extractBody(m.payload), snippet: m.snippet ?? '',
      }));
      await this.analyse(list);
      this.source.set('gmail');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      this.isScanning.set(false);
    }
  }

  /** Runs the bundled sample messages through the same pipeline (clearly labelled as samples). */
  async loadSamples(): Promise<void> {
    this.error.set('');
    this.isScanning.set(true);
    try {
      const samples = await this.ml.samples();
      await this.analyse(samples.map((s) => ({ id: s.id, raw: s.raw, snippet: s.label })));
      this.source.set('sample');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load samples.');
    } finally {
      this.isScanning.set(false);
    }
  }

  inputFor(id: string): EmailInput | undefined { return this.inputs.get(id); }
}
