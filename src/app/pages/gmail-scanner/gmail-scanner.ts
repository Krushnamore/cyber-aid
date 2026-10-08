import { ChangeDetectionStrategy, Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GmailService, EmailThreatReport } from '../../services/gmail';
import { AuthService } from '../../services/auth';
import { MLForensicService, EmailForensicReport } from '../../services/ml-forensic';
import { ForensicReportViewer } from '../../components/forensic-report-viewer/forensic-report-viewer';

@Component({
  selector: 'app-gmail-scanner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule, ForensicReportViewer],
  template: `
    <div class="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <!-- Header & Status Bar -->
      <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-border pb-6">
        <div>
          <span class="inline-flex items-center gap-2 font-semibold text-shield text-xs uppercase tracking-wider">
            <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">mail_lock</mat-icon>
            <span>Google Workspace Security Layer</span>
          </span>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Gmail Threat & Phishing Extractor
          </h1>
          <p class="mt-2 text-sm md:text-base text-muted-foreground">
            Reads your latest inbox messages through the Gmail API, checks SPF/DKIM/DMARC and relay headers, scores the wording and every link with trained models, and builds a forensic report per message.
          </p>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            (click)="gmailService.loadSamples()"
            [disabled]="gmailService.isScanning()"
            class="flex items-center gap-1.5 rounded-xl border border-shield/40 bg-shield/10 px-4 py-2.5 text-xs font-bold text-shield hover:bg-shield/20 transition-all shadow-sm disabled:opacity-50"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px]">science</mat-icon>
            <span>Try sample e-mails</span>
          </button>
          <button
            type="button"
            (click)="runScan()"
            [disabled]="gmailService.isScanning()"
            class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs md:text-sm font-bold text-primary-foreground shadow-md transition-all hover:opacity-90 disabled:opacity-50"
          >
            <mat-icon class="!w-4 !h-4 !text-[18px] leading-none" [class.animate-spin]="gmailService.isScanning()">
              {{ gmailService.isScanning() ? 'refresh' : authService.hasGmailAccess() ? 'sync' : 'link' }}
            </mat-icon>
            <span>{{ gmailService.isScanning() ? 'Reading & analysing…' : authService.hasGmailAccess() ? 'Scan my inbox' : 'Connect Gmail (read-only)' }}</span>
          </button>
        </div>
      </div>

      @if (gmailService.error()) {
        <div class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">{{ gmailService.error() }}</div>
      }
      @if (gmailService.source() === 'sample') {
        <div class="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-semibold text-foreground">
          Showing bundled SAMPLE e-mails (not your inbox). They are analysed by the same models and header parser. Connect Gmail to scan real messages.
        </div>
      }
      @if (gmailService.source() === null && !gmailService.isScanning()) {
        <div class="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <p class="font-bold text-foreground">Nothing scanned yet.</p>
          <p class="mt-1">Connect Gmail to analyse your latest 15 inbox messages (CyberAid asks for read-only access; message content is analysed in memory and not stored). You can also
            <a routerLink="/verify" class="text-primary font-bold underline">paste any e-mail into the Verify page</a>.</p>
        </div>
      }

      <!-- Live Threat Notification Banner if Harmful Found -->
      @if (harmfulCount() > 0) {
        <div class="rounded-2xl border-2 border-danger bg-danger/10 p-5 shadow-card flex items-start gap-4 animate-in fade-in duration-300">
          <mat-icon class="!w-8 !h-8 !text-[32px] text-danger shrink-0 mt-0.5">warning</mat-icon>
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-bold text-base md:text-lg text-danger">
                HIGH-RISK MALICIOUS EMAIL IDENTIFIED IN GMAIL
              </h3>
              <span class="rounded-full bg-danger px-2.5 py-0.5 text-xs font-extrabold text-danger-foreground">
                {{ harmfulCount() }} Malicious Emails
              </span>
            </div>
            <p class="mt-1 text-xs md:text-sm text-foreground/90 leading-relaxed">
              Trained models and header checks flagged these messages as likely phishing. Do not click their links; open the dossier for the evidence.
            </p>
            <div class="mt-3 flex items-center gap-3 flex-wrap">
              <a
                href="tel:1930"
                class="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3.5 py-1.5 text-xs font-bold text-danger-foreground"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">phone</mat-icon>
                <span>Report to 1930 Helpline</span>
              </a>
              <a
                routerLink="/assistant"
                class="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-card px-3.5 py-1.5 text-xs font-bold text-danger hover:bg-danger/10"
              >
                <span>Golden Hour Containment Guide</span>
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Metric Stats Bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p class="text-xs font-bold uppercase text-muted-foreground">Emails Extracted</p>
          <p class="mt-1 text-2xl font-extrabold text-foreground">{{ emails().length }}</p>
          <p class="text-xs text-muted-foreground mt-0.5">{{ gmailService.source() === 'sample' ? 'Bundled samples' : 'Gmail API' }}</p>
        </div>

        <div class="rounded-xl border border-danger/30 bg-danger/5 p-4 shadow-sm">
          <p class="text-xs font-bold uppercase text-danger">Harmful (High)</p>
          <p class="mt-1 text-2xl font-extrabold text-danger">{{ harmfulCount() }}</p>
          <p class="text-xs text-danger/80 mt-0.5">Quarantine recommended</p>
        </div>

        <div class="rounded-xl border border-warning/30 bg-warning/5 p-4 shadow-sm">
          <p class="text-xs font-bold uppercase text-warning">Suspicious Signals</p>
          <p class="mt-1 text-2xl font-extrabold text-warning">{{ suspiciousCount() }}</p>
          <p class="text-xs text-warning/80 mt-0.5">Anomaly detected</p>
        </div>

        <div class="rounded-xl border border-shield/30 bg-shield/5 p-4 shadow-sm">
          <p class="text-xs font-bold uppercase text-shield">Safe Verified</p>
          <p class="mt-1 text-2xl font-extrabold text-shield">{{ safeCount() }}</p>
          <p class="text-xs text-shield/80 mt-0.5">No strong indicators</p>
        </div>
      </div>

      <!-- Scanned Email Threat Feed -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-foreground">Extracted Messages & ML Forensic Assessments</h2>
          @if (gmailService.lastScanTime(); as time) {
            <span class="text-xs text-muted-foreground">Synced at {{ time }}</span>
          }
        </div>

        @for (email of emails(); track email.id) {
          <div
            class="rounded-2xl border-2 bg-card p-6 shadow-card transition-all"
            [class.border-danger]="email.status === 'HARMFUL'"
            [class.bg-danger/5]="email.status === 'HARMFUL'"
            [class.border-warning]="email.status === 'SUSPICIOUS'"
            [class.border-shield/40]="email.status === 'SAFE'"
          >
            <!-- Card Header -->
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="rounded-full px-3 py-1 text-xs font-extrabold tracking-wide"
                    [class.bg-danger]="email.status === 'HARMFUL'"
                    [class.text-danger-foreground]="email.status === 'HARMFUL'"
                    [class.bg-warning]="email.status === 'SUSPICIOUS'"
                    [class.text-warning-foreground]="email.status === 'SUSPICIOUS'"
                    [class.bg-shield]="email.status === 'SAFE'"
                    [class.text-shield-foreground]="email.status === 'SAFE'"
                  >
                    {{ email.status }}
                  </span>
                  <span class="text-xs font-bold text-muted-foreground">
                    Threat Score: {{ email.score }}/100
                  </span>
                  <span class="text-xs text-muted-foreground">• {{ email.threatCategory }}</span>
                </div>

                <h3 class="text-lg font-bold text-foreground leading-snug pt-1">
                  {{ email.subject }}
                </h3>

                <p class="text-xs text-muted-foreground font-mono">
                  From: {{ email.sender }} | {{ email.date }}
                </p>
              </div>

              <!-- Action button: Open Full Email Forensic Investigation Report -->
              <div class="shrink-0 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  (click)="openForensicReportForEmail(email)"
                  class="flex items-center gap-1.5 rounded-xl bg-navy-deep text-navy-foreground border border-shield/40 hover:border-shield px-3.5 py-2 text-xs font-bold shadow-sm transition-all active:scale-95"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-shield">assignment</mat-icon>
                  <span>View Forensic Dossier</span>
                </button>
              </div>
            </div>

            <!-- Snippet Text -->
            <div class="mt-4 rounded-xl bg-background p-3.5 text-xs md:text-sm text-foreground/90 font-mono border border-border">
              "{{ email.snippet }}"
            </div>

            <!-- Forensic Reasons -->
            <div class="mt-4 space-y-1.5">
              <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                ML Anomaly Indicators & Behavioral Scoring:
              </p>
              @for (reason of email.reasons; track reason) {
                <div class="flex items-start gap-2 text-xs text-foreground/85">
                  <span class="text-primary font-bold">•</span>
                  <span>{{ reason }}</span>
                </div>
              }
            </div>

            <!-- Extracted Links Inspector -->
            @if (email.extractedLinks.length > 0) {
              <div class="mt-4 pt-3 border-t border-border flex items-center gap-2 flex-wrap text-xs">
                <span class="font-bold text-muted-foreground">Extracted Links:</span>
                @for (link of email.extractedLinks; track link) {
                  <span class="rounded bg-muted px-2 py-1 font-mono text-danger font-semibold break-all">
                    {{ link }}
                  </span>
                }
              </div>
            }

            <!-- Bottom Bar with Forensic Report Action -->
            <div class="mt-4 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
              <div>
                <span class="font-bold text-foreground">Recommendation: </span>
                <span>{{ email.recommendedAction }}</span>
              </div>
              <button
                type="button"
                (click)="openForensicReportForEmail(email)"
                class="font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>Inspect Full Relay Path & ML Assessment</span>
                <mat-icon class="!w-3 !h-3 !text-[14px]">arrow_forward</mat-icon>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- POPUP DOSSIER VIEWER (Identical to 2-page PDF) -->
      @if (activeForensicDossier()) {
        <app-forensic-report-viewer
          [report]="activeForensicDossier()"
          (closeReport)="activeForensicDossier.set(null)"
        />
      }
    </div>
  `,
})
export class GmailScannerPage implements OnInit {
  gmailService = inject(GmailService);
  authService = inject(AuthService);
  private mlForensicService = inject(MLForensicService);

  activeForensicDossier = signal<EmailForensicReport | null>(null);

  emails = computed(() => this.gmailService.scannedEmails());
  harmfulCount = computed(() => this.emails().filter((e) => e.status === 'HARMFUL').length);
  suspiciousCount = computed(() => this.emails().filter((e) => e.status === 'SUSPICIOUS').length);
  safeCount = computed(() => this.emails().filter((e) => e.status === 'SAFE').length);

  ngOnInit() {
    if (this.authService.getAccessToken() && this.emails().length === 0) this.gmailService.scanInbox();
  }

  async runScan() {
    if (!this.authService.getAccessToken()) {
      try {
        await this.authService.connectGmail();
      } catch (err) {
        this.gmailService.error.set(err instanceof Error && !/popup/i.test(err.message) ? err.message : 'Gmail connection was cancelled or blocked by the browser.');
        return;
      }
    }
    await this.gmailService.scanInbox();
  }

  async openForensicReportForEmail(email: EmailThreatReport) {
    const input = this.gmailService.inputFor(email.id);
    if (!input) return;
    try {
      this.activeForensicDossier.set(await this.mlForensicService.analyzeEmail(input, true));
    } catch (err) {
      this.gmailService.error.set(err instanceof Error ? err.message : 'Could not build the report.');
    }
  }
}
