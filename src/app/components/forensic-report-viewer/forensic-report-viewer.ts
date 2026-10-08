import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { EmailForensicReport } from '../../services/ml-forensic';

@Component({
  selector: 'app-forensic-report-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (report(); as rep) {
      <div class="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
        <div class="mx-auto max-w-4xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
          <!-- Top Tool Action Bar (Not printed) -->
          <div class="flex items-center justify-between bg-navy-deep px-6 py-3 border-b border-navy-foreground/15 text-navy-foreground print:hidden">
            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="h-2 w-2 rounded-full bg-shield animate-pulse"></span>
              <span class="font-bold text-shield uppercase tracking-wider">OFFICIAL FORENSIC DOSSIER</span>
              <span class="text-navy-foreground/60">• {{ rep.caseId }}</span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="printDossier()"
                class="flex items-center gap-1.5 rounded-lg bg-shield px-3 py-1.5 text-xs font-bold text-shield-foreground hover:opacity-90 transition-all"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">print</mat-icon>
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                (click)="downloadJson(rep)"
                class="flex items-center gap-1.5 rounded-lg border border-navy-foreground/20 bg-navy px-3 py-1.5 text-xs font-bold text-navy-foreground hover:bg-navy-foreground/10 transition-all"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">download</mat-icon>
                <span>Download JSON</span>
              </button>
              <button
                type="button"
                (click)="closeReport.emit()"
                class="rounded-lg p-1.5 text-navy-foreground/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close report"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px]">close</mat-icon>
              </button>
            </div>
          </div>

          <!-- Printable Forensic Document (Exact layout from PDF) -->
          <div id="printable-dossier" class="bg-white text-slate-900 p-8 md:p-12 font-sans space-y-8 select-text">
            <!-- PAGE 1 HEADER -->
            <div class="rounded-xl bg-[#0f172a] text-white p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight">
                  Email Forensic Investigation Report
                </h1>
                <p class="text-xs font-mono text-slate-300 mt-1">
                  Case ID: {{ rep.caseId }}
                </p>
                <p class="text-xs font-mono text-slate-400 mt-0.5">
                  Generated: {{ rep.generatedDate }}
                </p>
              </div>

              <div class="shrink-0">
                <span
                  class="rounded-full px-4 py-1.5 text-xs font-extrabold tracking-wide uppercase shadow-sm"
                  [class.bg-red-600]="rep.verdict === 'HIGH'"
                  [class.text-white]="rep.verdict === 'HIGH'"
                  [class.bg-amber-500]="rep.verdict === 'MEDIUM'"
                  [class.text-white]="rep.verdict === 'MEDIUM'"
                  [class.bg-emerald-600]="rep.verdict === 'LOW'"
                  [class.text-white]="rep.verdict === 'LOW'"
                >
                  {{ rep.verdict }} • {{ rep.threatScore }}/100
                </span>
              </div>
            </div>

            <!-- 1. VERDICT SUMMARY -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                VERDICT SUMMARY
              </h2>
              <div class="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <span class="text-slate-600">Threat Score</span>
                <span class="font-bold text-slate-900">{{ rep.threatScore }} / 100</span>

                <span class="text-slate-600">Verdict</span>
                <span class="font-extrabold" [class.text-red-600]="rep.verdict === 'HIGH'">{{ rep.verdict }}</span>

                <span class="text-slate-600">Attribution Label</span>
                <span class="font-bold text-slate-900">{{ rep.attributionLabel }}</span>

                <span class="text-slate-600">Attribution Confidence</span>
                <span class="font-bold text-slate-900">{{ rep.attributionConfidence }}%</span>

                <span class="text-slate-600">Campaign ID</span>
                <span class="font-bold text-slate-900">{{ rep.campaignId }}</span>

                <span class="text-slate-600">Limited Forensics Mode</span>
                <span class="font-bold text-slate-900">{{ rep.limitedForensicsMode ? 'True' : 'False' }}</span>
              </div>
            </div>

            <!-- 2. SENDER INFORMATION -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                SENDER INFORMATION
              </h2>
              <div class="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <span class="text-slate-600">From</span>
                <span class="font-bold text-slate-900 break-all">{{ rep.senderInfo.from }}</span>

                <span class="text-slate-600">From Display Name</span>
                <span class="text-slate-900">{{ rep.senderInfo.fromDisplayName }}</span>

                <span class="text-slate-600">From Domain</span>
                <span class="font-bold text-slate-900">{{ rep.senderInfo.fromDomain }}</span>

                <span class="text-slate-600">Return-Path Domain</span>
                <span class="text-slate-900">{{ rep.senderInfo.returnPathDomain }}</span>

                <span class="text-slate-600">Subject</span>
                <span class="font-bold text-slate-900 break-words">{{ rep.senderInfo.subject }}</span>

                <span class="text-slate-600">Date</span>
                <span class="text-slate-900">{{ rep.senderInfo.date }}</span>
              </div>
            </div>

            <!-- 3. AUTHENTICATION (SPF / DKIM / DMARC) -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                AUTHENTICATION (SPF / DKIM / DMARC)
              </h2>
              <div class="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <span class="text-slate-600">SPF</span>
                <span class="font-bold" [class.text-red-600]="rep.authentication.spf !== 'pass'" [class.text-emerald-700]="rep.authentication.spf === 'pass'">
                  {{ rep.authentication.spf }}
                </span>

                <span class="text-slate-600">DKIM</span>
                <span class="font-bold" [class.text-red-600]="rep.authentication.dkim === 'fail'" [class.text-emerald-700]="rep.authentication.dkim === 'pass'">
                  {{ rep.authentication.dkim }}
                </span>

                <span class="text-slate-600">DMARC</span>
                <span class="font-bold" [class.text-red-600]="rep.authentication.dmarc === 'fail'" [class.text-emerald-700]="rep.authentication.dmarc === 'pass'">
                  {{ rep.authentication.dmarc }}
                </span>

                <span class="text-slate-600">Return-Path Mismatch</span>
                <span class="font-bold text-slate-900">{{ rep.authentication.returnPathMismatch ? 'True' : 'False' }}</span>
              </div>
            </div>

            <!-- 4. NETWORK & GEOLOCATION INTELLIGENCE -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                NETWORK & GEOLOCATION INTELLIGENCE
              </h2>
              <div class="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <span class="text-slate-600">Earliest Public Relay IP</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.earliestPublicRelayIp }}</span>

                <span class="text-slate-600">Probable Country</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.probableCountry }}</span>

                <span class="text-slate-600">Probable City</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.probableCity }}</span>

                <span class="text-slate-600">ISP / Org</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.ispOrg }}</span>

                <span class="text-slate-600">Location Disclaimer</span>
                <span class="text-slate-700 italic text-[11px] leading-snug">{{ rep.networkIntelligence.locationDisclaimer }}</span>

                <span class="text-slate-600">Tor Exit Node</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.torExitNode ? 'True' : 'False' }}</span>

                <span class="text-slate-600">Known VPN Provider</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.knownVpnProvider ? 'True' : 'False' }}</span>

                <span class="text-slate-600">Generic Cloud Hosting</span>
                <span class="font-bold text-slate-900">{{ rep.networkIntelligence.genericCloudHosting ? 'True' : 'False' }}</span>
              </div>
            </div>

            <!-- PAGE BREAK DIVIDER IN REPORT -->
            <div class="border-t-2 border-dashed border-slate-300 pt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Case {{ rep.caseId }}</span>
              <span>Page 1 of 2</span>
            </div>

            <!-- 5. DOMAIN (WHOIS) INTELLIGENCE -->
            <div class="pt-6">
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                DOMAIN (WHOIS) INTELLIGENCE
              </h2>
              <div class="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <span class="text-slate-600">Registrar</span>
                <span class="font-bold text-slate-900">{{ rep.domainWhois.registrar }}</span>

                <span class="text-slate-600">Creation Date</span>
                <span class="font-bold text-slate-900">{{ rep.domainWhois.creationDate }}</span>

                <span class="text-slate-600">Domain Age (days)</span>
                <span class="font-bold text-slate-900">{{ rep.domainWhois.domainAgeDays }}</span>
              </div>
            </div>

            <!-- 6. RELAY PATH (OLDEST HOP FIRST) -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                RELAY PATH (OLDEST HOP FIRST)
              </h2>
              <div class="space-y-1.5 font-mono text-[11px] text-slate-800">
                @for (hop of rep.relayPath; track hop.hopNumber) {
                  <div class="flex items-start gap-2">
                    <span class="font-bold text-slate-900 shrink-0">Hop {{ hop.hopNumber }}</span>
                    <span class="break-all">from {{ hop.from }} by {{ hop.by }} [{{ hop.ip }}]</span>
                  </div>
                }
              </div>
            </div>

            <!-- 7. SCORING RATIONALE -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                SCORING RATIONALE
              </h2>
              <ul class="space-y-1 font-mono text-xs text-slate-800 list-disc list-inside">
                @for (rationale of rep.scoringRationale; track rationale) {
                  <li>{{ rationale }}</li>
                }
              </ul>
            </div>

            <!-- 8. MACHINE LEARNING ASSESSMENT -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                MACHINE LEARNING ASSESSMENT
              </h2>
              <p class="font-mono text-xs text-slate-800 leading-relaxed mb-3">
                {{ rep.machineLearningAssessment.summary }}
              </p>
              <p class="font-mono text-xs text-slate-600 mb-1.5">Top phrases driving this classification:</p>
              <div class="space-y-1 font-mono text-xs">
                @for (p of rep.machineLearningAssessment.topPhrases; track p.phrase) {
                  <div class="flex items-center justify-between border-b border-slate-200 py-1">
                    <span class="font-semibold text-slate-900">'{{ p.phrase }}'</span>
                    <span class="text-slate-700">weight {{ p.weight.toFixed(2) }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- 9. RECOMMENDED ACTIONS -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                RECOMMENDED ACTIONS
              </h2>
              <p class="font-mono text-xs font-bold text-red-600 mb-1">
                {{ rep.recommendedActions.riskTitle }}
              </p>
              <ul class="space-y-1 font-mono text-xs text-slate-800 list-disc list-inside">
                @for (action of rep.recommendedActions.items; track action) {
                  <li>{{ action }}</li>
                }
              </ul>
            </div>

            <!-- 10. EVIDENCE INTEGRITY -->
            <div>
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-3">
                EVIDENCE INTEGRITY
              </h2>
              <div class="grid grid-cols-2 text-xs font-mono">
                <span class="text-slate-600">Evidence SHA-256</span>
                <span class="font-bold text-slate-900 break-all">{{ rep.evidenceIntegrity.sha256 }}</span>
              </div>
            </div>

            <!-- 11. ATTRIBUTION LIMITATIONS -->
            <div class="pt-2">
              <h2 class="text-xs font-extrabold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
                ATTRIBUTION LIMITATIONS
              </h2>
              <p class="text-[11px] font-sans text-slate-600 leading-relaxed text-justify">
                {{ rep.attributionLimitations }}
              </p>
            </div>

            <!-- PAGE 2 FOOTER -->
            <div class="border-t-2 border-slate-900 pt-3 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Case {{ rep.caseId }}</span>
              <span>Page 2 of 2</span>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ForensicReportViewer {
  report = input<EmailForensicReport | null>(null);
  closeReport = output<void>();

  printDossier() {
    window.print();
  }

  downloadJson(rep: EmailForensicReport) {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rep, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `${rep.caseId}-forensic-investigation-report.json`);
    dlAnchorElem.click();
  }
}
