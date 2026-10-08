import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import jsQR from 'jsqr';
import { ApiService } from '../../services/api';
import { MLForensicService } from '../../services/ml-forensic';
import { ForensicReportViewer } from '../../components/forensic-report-viewer/forensic-report-viewer';
import type { EmailForensicReport, ModelCard, ScanKind, ScanResponse } from '../../../shared/api-types';

type Mode = 'text' | 'phone' | 'qr' | 'email';

@Component({
  selector: 'app-verify',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, ForensicReportViewer],
  template: `
    <section class="relative overflow-hidden bg-background border-b border-border">
      <div class="grid-bg absolute inset-0 opacity-30 pointer-events-none"></div>
      <div class="relative mx-auto max-w-5xl px-4 py-8 text-center md:py-12">
        <span class="inline-flex items-center gap-2 rounded-full border border-shield/30 bg-accent px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-accent-foreground shadow-sm">
          <mat-icon class="!w-4 !h-4 !text-[16px] text-shield leading-none">biotech</mat-icon>
          <span>Scam Verification Suite</span>
        </span>
        <h1 class="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight text-foreground md:text-5xl tracking-tight">
          Check it
          <span class="block text-primary">Before You Click, Pay or Reply</span>
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">
          Links, UPI IDs, phone numbers, SMS/e-mail text and QR codes are checked by trained machine-learning models,
          domain reputation, live domain-age lookups and reports from the CyberAid community.
        </p>
        <div class="mt-4 flex items-center justify-center gap-3 flex-wrap">
          <a routerLink="/gmail" class="inline-flex items-center gap-2 rounded-xl bg-navy-deep px-4 py-2 text-xs font-bold text-navy-foreground border border-shield/30 hover:border-shield transition-all shadow-sm">
            <mat-icon class="!w-4 !h-4 !text-[16px] text-shield">mail_lock</mat-icon>
            <span>Scan my Gmail inbox →</span>
          </a>
          <button type="button" (click)="toggleModelCard()" class="inline-flex items-center gap-2 rounded-xl border border-shield/40 bg-shield/10 px-4 py-2 text-xs font-bold text-shield hover:bg-shield/20 transition-all shadow-sm">
            <mat-icon class="!w-4 !h-4 !text-[16px]">query_stats</mat-icon>
            <span>How accurate are the models?</span>
          </button>
        </div>
      </div>
    </section>

    @if (showModelCard()) {
      <section class="mx-auto max-w-4xl px-4 pt-6">
        <div class="rounded-2xl border border-border bg-card p-4 md:p-5 shadow-card text-xs space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-extrabold text-foreground">Model cards (measured on held-out data)</h2>
            <button type="button" (click)="showModelCard.set(false)" class="text-muted-foreground hover:text-foreground"><mat-icon class="!w-5 !h-5 !text-[20px]">close</mat-icon></button>
          </div>
          @for (m of modelCards(); track m.name) {
            <div class="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <p class="font-bold text-foreground">{{ m.name }} <span class="font-mono text-muted-foreground">v{{ m.version }}</span></p>
              <p class="text-muted-foreground">{{ m.algorithm }}</p>
              <div class="flex flex-wrap gap-1.5">
                @for (t of trainedOn(m); track t[0]) {
                  <span class="rounded-full bg-card border border-border px-2 py-0.5 font-mono">{{ t[0] }}: {{ t[1] }}</span>
                }
              </div>
              @if (headline(m); as h) {
                <div class="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono">
                  <div class="rounded-lg bg-card border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground">F1</p><p class="font-bold text-foreground">{{ h.f1 }}</p></div>
                  <div class="rounded-lg bg-card border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground">Precision</p><p class="font-bold text-foreground">{{ h.precision }}</p></div>
                  <div class="rounded-lg bg-card border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground">Recall</p><p class="font-bold text-foreground">{{ h.recall }}</p></div>
                  <div class="rounded-lg bg-card border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground">False-alarm rate</p><p class="font-bold text-foreground">{{ h.false_positive_rate }}</p></div>
                  <div class="rounded-lg bg-card border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground">Test samples</p><p class="font-bold text-foreground">{{ h.n }}</p></div>
                </div>
              }
              @if (m.note) { <p class="text-muted-foreground italic">{{ m.note }}</p> }
            </div>
          }
          <p class="text-muted-foreground leading-relaxed">
            <b class="text-foreground">Limits:</b> no model is perfect. Small genuine websites can look unusual to the URL model and are capped at
            "suspicious" unless something else corroborates. Training data are public corpora (SMS Spam Collection, Enron e-mail, PhishTank,
            Phishing.Database) plus synthetic Indian-scam templates, so brand-new scam styles may be missed. Phone numbers and UPI IDs cannot be
            verified against a bank database — those checks use format rules and community reports. Always confirm through an official channel.
          </p>
        </div>
      </section>
    }

    <section class="relative z-10 mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div class="shadow-card rounded-2xl border border-border bg-card p-4 md:p-6 transition-all">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-xl bg-muted p-1.5 text-xs md:text-sm font-semibold">
          @for (t of tabs; track t.id) {
            <button type="button" (click)="setMode(t.id)"
              class="flex items-center justify-center gap-2 rounded-lg px-2 py-3 transition-all"
              [class.bg-card]="activeMode() === t.id" [class.text-foreground]="activeMode() === t.id"
              [class.shadow-xs]="activeMode() === t.id" [class.border]="activeMode() === t.id"
              [class.border-border]="activeMode() === t.id" [class.text-muted-foreground]="activeMode() !== t.id">
              <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">{{ t.icon }}</mat-icon>
              <span>{{ t.label }}</span>
            </button>
          }
        </div>

        <div class="mt-5">
          @if (activeMode() === 'qr') {
            <label (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)"
              class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all"
              [class.border-primary]="isDragging()" [class.bg-secondary]="isDragging()" [class.border-input]="!isDragging()">
              <mat-icon class="!w-12 !h-12 !text-[48px] text-shield leading-none mb-2">qr_code_scanner</mat-icon>
              <p class="mt-1 text-base md:text-lg font-bold text-foreground">{{ qrFileName() || 'Drop a QR image or tap to choose' }}</p>
              <p class="text-xs text-muted-foreground mt-1">PNG / JPG / screenshot. The QR is decoded in your browser; only its text is analysed.</p>
              <input type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)" />
            </label>
            @if (qrPayload()) {
              <div class="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs font-mono break-all">
                <span class="text-muted-foreground">Decoded QR content:</span> {{ qrPayload() }}
              </div>
            }
          } @else if (activeMode() === 'email') {
            <div class="space-y-2">
              <textarea [value]="inputText()" (input)="onInputChange($event)" rows="8" [placeholder]="placeholder()"
                class="w-full resize-y rounded-xl border border-input bg-card p-4 text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring transition-all"></textarea>
              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span class="text-muted-foreground">Try a sample:</span>
                @for (s of samples(); track s.id) {
                  <button type="button" (click)="inputText.set(s.raw)" class="rounded-full border border-border bg-muted px-2.5 py-1 font-semibold hover:bg-card">{{ s.label }}</button>
                }
              </div>
              <p class="text-[11px] text-muted-foreground">In Gmail: ⋮ → "Show original" → copy everything. The full header (with Authentication-Results and Received lines) gives the best analysis.</p>
            </div>
          } @else {
            <div class="relative">
              <textarea [value]="inputText()" (input)="onInputChange($event)" rows="4" [placeholder]="placeholder()"
                class="w-full resize-none rounded-xl border border-input bg-card p-4 text-sm md:text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring transition-all"></textarea>
              @if (inputText()) {
                <button type="button" (click)="clearInput()" class="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-md" aria-label="Clear input">
                  <mat-icon class="!w-5 !h-5 !text-[20px]">close</mat-icon>
                </button>
              }
            </div>
          }
        </div>

        <button type="button" [disabled]="!canVerify() || isScanning()" (click)="handleVerify()"
          class="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm md:text-base font-bold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed">
          @if (isScanning()) {
            <mat-icon class="!w-6 !h-6 !text-[24px] animate-spin">refresh</mat-icon>
            <span>Analysing…</span>
          } @else {
            <mat-icon class="!w-6 !h-6 !text-[24px]">policy</mat-icon>
            <span>{{ activeMode() === 'email' ? 'Analyse e-mail' : 'Check now' }}</span>
          }
        </button>

        @if (error()) {
          <div class="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">{{ error() }}</div>
        }

        @if (isScanning()) {
          <div class="relative mt-6 flex h-32 items-center justify-center overflow-hidden rounded-xl bg-navy text-navy-foreground shadow-inner">
            <div class="absolute inset-x-0 h-1 bg-shield shadow-[0_0_20px_4px] shadow-shield animate-scan-sweep pointer-events-none"></div>
            <mat-icon class="!w-12 !h-12 !text-[48px] text-shield leading-none animate-pulse-glow">biotech</mat-icon>
          </div>
        }

        <!-- RESULT: link / UPI / phone / text / QR -->
        @if (result(); as r) {
          <div class="mt-8 rounded-2xl border-2 overflow-hidden shadow-card"
            [class.border-danger]="r.verdict === 'high'" [class.border-warning]="r.verdict === 'suspicious'" [class.border-shield]="r.verdict === 'safe'">
            <div class="p-4 md:p-5 text-white"
              [class.bg-danger]="r.verdict === 'high'" [class.bg-warning]="r.verdict === 'suspicious'" [class.bg-shield]="r.verdict === 'safe'">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-3">
                  <mat-icon class="!w-9 !h-9 !text-[36px]">{{ r.verdict === 'high' ? 'gpp_bad' : r.verdict === 'suspicious' ? 'warning' : 'verified_user' }}</mat-icon>
                  <div>
                    <p class="text-[11px] font-bold uppercase tracking-wider opacity-90">{{ kindLabel(r.kind) }} · {{ r.id }}</p>
                    <h3 class="text-lg md:text-xl font-extrabold leading-tight">{{ r.summary }}</h3>
                  </div>
                </div>
                <div class="text-right">
                  <p class="text-3xl font-extrabold leading-none">{{ r.score }}<span class="text-sm opacity-80">/100</span></p>
                  <p class="text-[11px] font-bold uppercase opacity-90">risk score</p>
                </div>
              </div>
              <div class="mt-3 h-2 w-full rounded-full bg-white/25 overflow-hidden"><div class="h-full rounded-full bg-white transition-all duration-700" [style.width.%]="r.score"></div></div>
            </div>

            <div class="p-4 md:p-6 space-y-5 bg-card">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Why this verdict</h4>
                <ul class="space-y-1.5 text-sm text-foreground/90">
                  @for (reason of r.reasons; track reason) {
                    <li class="flex items-start gap-2"><span class="text-primary font-bold">•</span><span>{{ reason }}</span></li>
                  }
                </ul>
                @if (r.communityReports > 0) {
                  <p class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-danger/10 border border-danger/30 px-2.5 py-1 text-xs font-bold text-danger">
                    <mat-icon class="!w-4 !h-4 !text-[16px]">groups</mat-icon>{{ r.communityReports }} community report(s)
                  </p>
                }
              </div>

              @if (r.extracted && (r.extracted.urls.length || r.extracted.upi.length || r.extracted.phones.length)) {
                <div class="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1 font-mono break-all">
                  <p class="text-[11px] font-bold uppercase text-muted-foreground font-sans">Found inside the message</p>
                  @for (u of r.extracted.urls; track u) { <p>🔗 {{ u }}</p> }
                  @for (u of r.extracted.upi; track u) { <p>💳 {{ u }}</p> }
                  @for (u of r.extracted.phones; track u) { <p>📞 {{ u }}</p> }
                </div>
              }

              @for (m of r.models; track $index) {
                <div class="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                  <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <mat-icon class="!w-4 !h-4 !text-[16px] text-primary">psychology</mat-icon><span>{{ m.name }}</span>
                    </h4>
                    <span class="text-[11px] font-mono text-muted-foreground">v{{ m.version }} · model score {{ (m.probability * 100).toFixed(0) }}%</span>
                  </div>
                  <p class="text-[11px] font-bold text-muted-foreground">Strongest evidence (red pushes towards scam, green towards safe):</p>
                  <div class="space-y-1 text-xs font-mono">
                    @for (f of m.topFeatures; track f.feature) {
                      <div class="flex items-center gap-2 bg-card p-1.5 rounded-lg border border-border">
                        <span class="w-40 md:w-56 truncate font-bold text-foreground" [title]="f.feature">{{ f.feature }}</span>
                        <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div class="h-full rounded-full" [class.bg-danger]="f.contribution > 0" [class.bg-shield]="f.contribution <= 0" [style.width.%]="barWidth(f.contribution)"></div>
                        </div>
                        <span class="w-14 text-right text-muted-foreground">{{ f.contribution > 0 ? '+' : '' }}{{ f.contribution.toFixed(2) }}</span>
                      </div>
                    }
                  </div>
                </div>
              }

              <div class="rounded-xl border border-shield/30 bg-shield/5 p-4 space-y-2">
                <h4 class="text-xs font-bold uppercase tracking-wider text-shield flex items-center gap-1.5"><mat-icon class="!w-4 !h-4 !text-[16px]">verified</mat-icon><span>What to do</span></h4>
                <ul class="space-y-1.5 text-sm text-foreground/90">
                  @for (a of r.recommendedActions; track a) { <li class="flex items-start gap-2"><span class="text-shield font-bold">•</span><span>{{ a }}</span></li> }
                </ul>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <button type="button" (click)="blockEntity(r)" class="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card hover:bg-muted py-3 text-xs font-bold text-foreground transition-all">
                  <mat-icon class="!w-4 !h-4 !text-[18px] text-muted-foreground">block</mat-icon><span>{{ r.blocked ? 'Blocked' : 'Block for me' }}</span>
                </button>
                <button type="button" (click)="reportEntity(r)" class="flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-card hover:bg-muted py-3 text-xs font-bold text-foreground transition-all">
                  <mat-icon class="!w-4 !h-4 !text-[18px] text-primary">flag</mat-icon><span>Report to community</span>
                </button>
                <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" class="flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 py-3 text-xs font-bold text-primary transition-all text-center">
                  <mat-icon class="!w-4 !h-4 !text-[18px]">open_in_new</mat-icon><span>File on NCRP</span>
                </a>
                <a routerLink="/assistant" class="flex items-center justify-center gap-1.5 rounded-xl bg-shield hover:opacity-90 py-3 text-xs font-bold text-shield-foreground transition-all text-center shadow-xs">
                  <mat-icon class="!w-4 !h-4 !text-[18px]">support_agent</mat-icon><span>Get help</span>
                </a>
              </div>
              <div class="flex justify-end">
                <button type="button" (click)="exportJson(r, r.id)" class="text-[11px] font-semibold text-muted-foreground underline hover:text-foreground">Download JSON</button>
              </div>
            </div>
          </div>
        }

        <!-- RESULT: e-mail -->
        @if (emailReport(); as e) {
          <div class="mt-8 rounded-2xl border-2 border-border bg-card overflow-hidden shadow-card">
            <div class="bg-navy-deep p-4 md:p-5 text-navy-foreground">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-xs font-bold text-shield tracking-wider uppercase">Case {{ e.caseId }}</span>
                    <span class="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                      [class.bg-danger]="e.verdict === 'HIGH'" [class.text-danger-foreground]="e.verdict === 'HIGH'"
                      [class.bg-warning]="e.verdict === 'MEDIUM'" [class.text-warning-foreground]="e.verdict === 'MEDIUM'"
                      [class.bg-shield]="e.verdict === 'LOW'" [class.text-shield-foreground]="e.verdict === 'LOW'">{{ e.verdict }} · {{ e.threatScore }}/100</span>
                  </div>
                  <h3 class="text-base font-bold mt-1">{{ e.attributionLabel }}</h3>
                  <p class="text-xs opacity-75 mt-0.5 truncate max-w-md">{{ e.senderInfo.subject }}</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <button type="button" (click)="activeModalDossier.set(e)" class="flex items-center gap-1 rounded-lg bg-shield px-3 py-1.5 text-xs font-bold text-shield-foreground hover:opacity-90"><mat-icon class="!w-4 !h-4 !text-[16px]">visibility</mat-icon><span>Full forensic report</span></button>
                  <button type="button" (click)="exportJson(e, e.caseId)" class="flex items-center gap-1 rounded-lg border border-navy-foreground/20 bg-navy px-3 py-1.5 text-xs font-bold hover:bg-navy/80"><mat-icon class="!w-4 !h-4 !text-[16px]">download</mat-icon><span>JSON</span></button>
                </div>
              </div>
            </div>
            <div class="p-4 md:p-6 space-y-4 text-sm">
              <div class="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div class="rounded-lg border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground font-sans">SPF</p><p class="font-bold" [class.text-danger]="e.authentication.spf === 'fail' || e.authentication.spf === 'softfail'" [class.text-shield]="e.authentication.spf === 'pass'">{{ e.authentication.spf }}</p></div>
                <div class="rounded-lg border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground font-sans">DKIM</p><p class="font-bold" [class.text-danger]="e.authentication.dkim === 'fail'" [class.text-shield]="e.authentication.dkim === 'pass'">{{ e.authentication.dkim }}</p></div>
                <div class="rounded-lg border border-border p-2"><p class="text-[10px] uppercase text-muted-foreground font-sans">DMARC</p><p class="font-bold" [class.text-danger]="e.authentication.dmarc === 'fail'" [class.text-shield]="e.authentication.dmarc === 'pass'">{{ e.authentication.dmarc }}</p></div>
              </div>
              <ul class="space-y-1.5 text-foreground/90">
                @for (x of e.scoringRationale; track x) { <li class="flex items-start gap-2"><span class="text-primary font-bold">•</span><span>{{ x }}</span></li> }
              </ul>
              @if (e.limitedForensicsMode) { <p class="text-xs text-warning font-semibold">Limited analysis: no authentication headers were found. Paste the full original message for SPF/DKIM/DMARC checks.</p> }
              <ul class="space-y-1.5 text-foreground/90 rounded-xl border border-shield/30 bg-shield/5 p-3">
                @for (x of e.recommendedActions.items; track x) { <li class="flex items-start gap-2"><span class="text-shield font-bold">•</span><span>{{ x }}</span></li> }
              </ul>
            </div>
          </div>
        }
      </div>

      <div class="text-center text-xs text-muted-foreground space-x-1">
        <span>Try:</span>
        @for (s of quickSamples; track s.text) {
          <button type="button" (click)="setInput(s.text, s.mode)" class="underline font-bold text-primary hover:text-foreground mx-1">{{ s.label }}</button>
        }
      </div>
    </section>

    @if (activeModalDossier(); as dossier) {
      <app-forensic-report-viewer [report]="dossier" (closeReport)="activeModalDossier.set(null)" />
    }

    @if (toastMessage()) {
      <div class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-navy px-5 py-2.5 text-xs font-bold text-navy-foreground shadow-card border border-shield/40 animate-in fade-in">
        <div class="flex items-center gap-2"><mat-icon class="!w-4 !h-4 !text-[18px] text-shield">check_circle</mat-icon><span>{{ toastMessage() }}</span></div>
      </div>
    }
  `,
})
export class VerifyPage {
  private api = inject(ApiService);
  private ml = inject(MLForensicService);

  tabs: { id: Mode; label: string; icon: string }[] = [
    { id: 'text', label: 'Link / UPI / Text', icon: 'link' },
    { id: 'phone', label: 'Phone / SMS', icon: 'smartphone' },
    { id: 'qr', label: 'QR code', icon: 'qr_code' },
    { id: 'email', label: 'E-mail', icon: 'mail' },
  ];
  quickSamples: { label: string; text: string; mode: Mode }[] = [
    { label: '"SBI KYC link"', text: 'http://sbi-kyc-update.xyz/verify-account', mode: 'text' },
    { label: '"Lottery + OTP SMS"', text: 'Congratulations you won lottery of Rs 25 Lakh, share OTP now', mode: 'text' },
    { label: '"Genuine bank OTP SMS"', text: 'Your OTP is 482913. Do not share it with anyone. -HDFC Bank', mode: 'text' },
    { label: '"+92 caller"', text: '+92 300 1234567', mode: 'phone' },
  ];

  activeMode = signal<Mode>('text');
  inputText = signal('');
  qrFileName = signal<string | null>(null);
  qrPayload = signal<string | null>(null);
  isDragging = signal(false);
  isScanning = signal(false);
  result = signal<ScanResponse | null>(null);
  emailReport = signal<EmailForensicReport | null>(null);
  activeModalDossier = signal<EmailForensicReport | null>(null);
  toastMessage = signal('');
  error = signal('');
  showModelCard = signal(false);
  modelCards = signal<ModelCard[]>([]);
  samples = signal<{ id: string; label: string; raw: string }[]>([]);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  placeholder = computed(() => {
    switch (this.activeMode()) {
      case 'text': return 'Paste a link, UPI ID (name@bank), or a suspicious SMS / message…';
      case 'phone': return "e.g. +92 300 1234567, or paste what the caller / SMS said…";
      case 'email': return 'Paste the full original e-mail (headers + body) here…';
      default: return '';
    }
  });

  canVerify(): boolean {
    if (this.activeMode() === 'qr') return !!this.qrPayload();
    return this.inputText().trim().length > 0;
  }

  setMode(mode: Mode) {
    this.activeMode.set(mode);
    this.resetResults();
    if (mode === 'email' && !this.samples().length) this.ml.samples().then((s) => this.samples.set(s)).catch(() => undefined);
  }

  private resetResults() {
    this.result.set(null);
    this.emailReport.set(null);
    this.error.set('');
  }

  onInputChange(event: Event) { this.inputText.set((event.target as HTMLTextAreaElement).value); }
  clearInput() { this.inputText.set(''); this.resetResults(); }

  setInput(text: string, mode: Mode = 'text') {
    this.activeMode.set(mode);
    this.inputText.set(text);
    this.handleVerify();
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging.set(false); }
  onDrop(e: DragEvent) { e.preventDefault(); this.isDragging.set(false); const f = e.dataTransfer?.files?.[0]; if (f) this.loadQr(f); }
  onFileSelected(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.loadQr(f); }

  /** Decode the QR entirely in the browser with jsQR. */
  private async loadQr(file: File) {
    this.resetResults();
    this.qrFileName.set(file.name);
    this.qrPayload.set(null);
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (!code) { this.error.set('No QR code found in this image. Try a sharper, closer screenshot.'); return; }
      this.qrPayload.set(code.data);
    } catch {
      this.error.set('Could not read that image file.');
    }
  }

  async handleVerify() {
    if (!this.canVerify() || this.isScanning()) return;
    this.resetResults();
    this.isScanning.set(true);
    try {
      const mode = this.activeMode();
      if (mode === 'email') {
        this.emailReport.set(await this.ml.analyzeEmail({ raw: this.inputText() }));
      } else {
        const input = mode === 'qr' ? this.qrPayload()! : this.inputText();
        this.result.set(await this.api.post<ScanResponse>('/scan', { input, mode }));
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      this.isScanning.set(false);
    }
  }

  /** What to report / block: the most specific entity inside the scan. */
  private target(r: ScanResponse): { kind: ScanKind; value: string } {
    const upi = /^upi:\/\//i.test(r.qrPayload ?? r.input) ? new URL((r.qrPayload ?? r.input).replace(/^upi:\/\//i, 'https://x.invalid/')).searchParams.get('pa') : null;
    if (upi) return { kind: 'upi', value: upi };
    if (r.kind === 'text' || (r.kind === 'qr' && r.extracted)) {
      if (r.extracted?.urls[0]) return { kind: 'url', value: r.extracted.urls[0] };
      if (r.extracted?.upi[0]) return { kind: 'upi', value: r.extracted.upi[0] };
      if (r.extracted?.phones[0]) return { kind: 'phone', value: r.extracted.phones[0] };
    }
    return { kind: r.kind === 'qr' ? 'url' : r.kind, value: r.qrPayload ?? r.input };
  }

  async reportEntity(r: ScanResponse) {
    try {
      const t = this.target(r);
      const res = await this.api.post<{ duplicate: boolean; reports: number }>('/reports', t);
      this.showToast(res.duplicate ? 'You already reported this' : `Reported — ${res.reports} report(s) now on record`);
      this.result.update((x) => (x ? { ...x, communityReports: res.reports } : x));
    } catch (err) { this.showToast(err instanceof Error ? err.message : 'Could not submit report'); }
  }

  async blockEntity(r: ScanResponse) {
    try {
      await this.api.post('/blocklist', this.target(r));
      this.result.update((x) => (x ? { ...x, blocked: true } : x));
      this.showToast('Added to your blocklist — future scans will flag it');
    } catch (err) { this.showToast(err instanceof Error ? err.message : 'Could not block'); }
  }

  toggleModelCard() {
    this.showModelCard.update((v) => !v);
    if (this.showModelCard() && !this.modelCards().length) this.ml.modelCards().then((m) => this.modelCards.set(m)).catch(() => this.showToast('Could not load model info'));
  }

  trainedOn(m: ModelCard): [string, string][] { return Object.entries(m.trainedOn).map(([k, v]) => [k.replace(/_/g, ' '), Number(v).toLocaleString()]); }
  headline(m: ModelCard): { f1: number; precision: number; recall: number; false_positive_rate: number; n: number } | null {
    const x = m.metrics as Record<string, Record<string, number>>;
    return (x['combined'] ?? x['grouped_holdout'] ?? null) as never;
  }
  barWidth(c: number) { return Math.min(100, Math.abs(c) * 55); }
  kindLabel(k: ScanKind) { return ({ url: 'Link', upi: 'UPI ID', phone: 'Phone number', text: 'Message', qr: 'QR code', email: 'E-mail' })[k]; }

  exportJson(obj: unknown, name: string) {
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj, null, 2));
    a.download = `${name}.json`;
    a.click();
    this.showToast('JSON downloaded');
  }

  showToast(message: string) {
    this.toastMessage.set(message);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage.set(''), 2800);
  }
}
