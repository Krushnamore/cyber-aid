import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../services/api';
import { MatIconModule } from '@angular/material/icon';

type Origin = 'official' | 'derived' | 'ai';
interface YearStat {
  year: string;
  complaints: number | null;
  registeredCases: number | null;
  lossCrores: number | null;
  firs: number | null;
  origin: { complaints: Origin; registeredCases: Origin; lossCrores: Origin; firs: Origin };
}
interface StateFraudData { state: string; cases2024: number; cases2023: number; dominantScam: string | null; dominantScamOrigin: Origin | null }
interface National {
  years: YearStat[];
  states: StateFraudData[];
  categories2025: { name: string; pct: number; origin: Origin }[];
  fundsSaved: { crores: number; complaints: string; asOf: string; crores2025: number; totalReported2021to2025: number };
  commentary: { text: string; provider: string; generatedAt: string } | null;
  sources: { label: string; url: string }[];
  notes: string[];
  ai: { enabled: boolean; provider: string | null; generatedAt: string | null };
}

@Component({
  selector: 'app-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <!-- Title & Timeframe Selector -->
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <span class="inline-flex items-center gap-2 font-semibold text-shield text-xs uppercase tracking-wider">
            <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">insights</mat-icon>
            <span>NCRP · NCRB · MHA Official Data Observatory</span>
          </span>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            5-Year National Cyber Fraud Analytics (2021–2025)
          </h1>
          <p class="mt-2 text-sm md:text-base text-muted-foreground">
            Multi-year trends from official Government of India figures (NCRP complaints, NCRB registered cases, MHA replies in Parliament). Every figure is cited below.
          </p>
        </div>

        <!-- Filter Pill Selector -->
        <div class="flex items-center gap-1.5 rounded-xl bg-muted p-1 text-xs font-bold">
          <button
            type="button"
            (click)="selectedYear.set('ALL')"
            class="rounded-lg px-3 py-1.5 transition-all"
            [class.bg-card]="selectedYear() === 'ALL'"
            [class.text-foreground]="selectedYear() === 'ALL'"
            [class.shadow-xs]="selectedYear() === 'ALL'"
            [class.text-muted-foreground]="selectedYear() !== 'ALL'"
          >
            5-Yr Overview
          </button>
          @for (y of years; track y) {
            <button
              type="button"
              (click)="selectedYear.set(y)"
              class="rounded-lg px-3 py-1.5 transition-all"
              [class.bg-card]="selectedYear() === y"
              [class.text-foreground]="selectedYear() === y"
              [class.shadow-xs]="selectedYear() === y"
              [class.text-muted-foreground]="selectedYear() !== y"
            >
              {{ y }}
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <div class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">{{ error() }}</div>
      }
      @if (national()?.commentary; as c) {
        <div class="rounded-2xl border border-shield/30 bg-shield/5 p-4 text-sm text-foreground/90">
          <span class="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">AI summary · {{ c.provider }}</span>{{ c.text }}
        </div>
      }

      <!-- KPI Summary Cards (Dynamic based on selected timeframe) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="shadow-card rounded-2xl border border-border bg-card p-5">
          <div class="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold">
            <span>Total Fraud Complaints</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-danger">report_problem</mat-icon>
          </div>
          <p class="mt-2 font-display text-3xl font-extrabold text-foreground">
            {{ activeSummary().complaints }}
          </p>
          <p class="mt-1 text-xs text-danger font-semibold">
            {{ activeSummary().growthText }}
          </p>
        </div>

        <div class="shadow-card rounded-2xl border border-border bg-card p-5">
          <div class="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold">
            <span>Total Loss Amount</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-500">currency_rupee</mat-icon>
          </div>
          <p class="mt-2 font-display text-3xl font-extrabold text-foreground">
            {{ activeSummary().lossText }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ activeSummary().lossNote }}
          </p>
        </div>

        <div class="shadow-card rounded-2xl border border-shield/30 bg-shield/5 p-5">
          <div class="flex items-center justify-between text-shield text-xs uppercase font-bold">
            <span>Funds Saved via CFCFRMS / 1930</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-shield">security</mat-icon>
          </div>
          <p class="mt-2 font-display text-3xl font-extrabold text-shield">
            {{ activeSummary().savedText }}
          </p>
          <p class="mt-1 text-xs text-shield font-bold">
            {{ activeSummary().savedNote }}
          </p>
        </div>

        <div class="shadow-card rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div class="flex items-center justify-between text-primary text-xs uppercase font-bold">
            <span>FIR Conversion Rate</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-primary">gavel</mat-icon>
          </div>
          <p class="mt-2 font-display text-3xl font-extrabold text-primary">
            {{ activeSummary().firText }}
          </p>
          <p class="mt-1 text-xs text-primary font-semibold">
            {{ activeSummary().firNote }}
          </p>
        </div>
      </div>

      <!-- Main Visual Charts Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- 5-Year Trends Line & Area Chart (7 cols) -->
        <div class="shadow-card rounded-2xl border border-border bg-card p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between flex-wrap gap-2">
              <h2 class="text-lg font-bold text-foreground">
                5-Year Trajectory: Complaints vs Registered Cases
              </h2>
              <div class="flex items-center gap-3 text-xs font-semibold">
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded-full bg-danger"></span>
                  <span class="text-muted-foreground">NCRP Complaints</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded-full bg-shield"></span>
                  <span class="text-muted-foreground">Registered Cases (NCRB)</span>
                </span>
              </div>
            </div>
            <p class="text-xs text-muted-foreground mt-1">NCRP complaints (MHA) vs cases registered by police (NCRB, Crime in India; 2025 not yet published)</p>
          </div>

          <!-- Interactive SVG Line/Area Graph -->
          <div class="mt-6 relative h-72 w-full">
            <svg class="w-full h-full overflow-visible" viewBox="0 0 500 240" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaShieldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--shield)" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="var(--shield)" stop-opacity="0.0" />
                </linearGradient>
              </defs>

              <!-- Horizontal Grid Lines -->
              <line x1="45" y1="20" x2="480" y2="20" stroke="var(--border)" stroke-dasharray="3 3" />
              <text x="36" y="24" fill="var(--muted-foreground)" font-size="10" text-anchor="end">{{ yLabels()[0] }}</text>

              <line x1="45" y1="80" x2="480" y2="80" stroke="var(--border)" stroke-dasharray="3 3" />
              <text x="36" y="84" fill="var(--muted-foreground)" font-size="10" text-anchor="end">{{ yLabels()[1] }}</text>

              <line x1="45" y1="140" x2="480" y2="140" stroke="var(--border)" stroke-dasharray="3 3" />
              <text x="36" y="144" fill="var(--muted-foreground)" font-size="10" text-anchor="end">{{ yLabels()[2] }}</text>

              <line x1="45" y1="200" x2="480" y2="200" stroke="var(--border)" />
              <text x="36" y="204" fill="var(--muted-foreground)" font-size="10" text-anchor="end">{{ yLabels()[3] }}</text>

              <!-- Shaded Area for Prevented -->
              <polygon [attr.points]="areaPoints()"
                fill="url(#areaShieldGrad)"
              />

              <!-- Reported Red Line (Danger) -->
              <path [attr.d]="reportedPath()"
                fill="none"
                stroke="var(--danger)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Prevented Green Line (Shield) -->
              <path [attr.d]="registeredPath()"
                fill="none"
                stroke="var(--shield)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Data Points & Labels -->
              @for (stat of fiveYearHistory; track stat.year; let i = $index) {
                <text
                  [attr.x]="70 + i * 100"
                  y="222"
                  fill="var(--muted-foreground)"
                  font-size="11"
                  font-weight="600"
                  text-anchor="middle"
                >
                  {{ stat.year }}
                </text>

                <!-- Reported circle -->
                <circle
                  [attr.cx]="70 + i * 100"
                  [attr.cy]="getY(stat.complaints)"
                  r="5"
                  fill="var(--card)"
                  stroke="var(--danger)"
                  stroke-width="3"
                  class="cursor-pointer hover:scale-125 transition-transform"
                  (mouseenter)="hoverPoint.set({ year: stat.year, type: 'Reported', count: stat.complaints ?? 0, loss: stat.lossCrores ?? 0, x: 70 + i * 100, y: getY(stat.complaints) })"
                  (mouseleave)="hoverPoint.set(null)"
                />

                @if (stat.registeredCases !== null) {
                <!-- Registered circle -->
                <circle
                  [attr.cx]="70 + i * 100"
                  [attr.cy]="getY(stat.registeredCases)"
                  r="5"
                  fill="var(--card)"
                  stroke="var(--shield)"
                  stroke-width="3"
                  class="cursor-pointer hover:scale-125 transition-transform"
                  (mouseenter)="hoverPoint.set({ year: stat.year, type: 'Registered', count: stat.registeredCases, loss: 0, x: 70 + i * 100, y: getY(stat.registeredCases) })"
                  (mouseleave)="hoverPoint.set(null)"
                />
                }
              }
            </svg>

            <!-- Floating Hover Tooltip -->
            @if (hoverPoint(); as hp) {
              <div
                class="absolute z-20 pointer-events-none rounded-xl bg-navy px-3.5 py-2 text-xs text-navy-foreground shadow-card border border-navy-foreground/20 -translate-x-1/2 -translate-y-full"
                [style.left.%]="(hp.x / 500) * 100"
                [style.top.px]="hp.y - 12"
              >
                <div class="font-bold flex items-center justify-between gap-2">
                  <span>{{ hp.year }}</span>
                  <span class="text-shield">{{ hp.type }}</span>
                </div>
                <p class="mt-0.5 font-mono">{{ hp.count.toLocaleString() }} {{ hp.type === 'Reported' ? 'Complaints' : 'Cases' }}</p>
                @if (hp.loss) {
                  <p class="text-[11px] text-navy-foreground/75 font-mono">₹{{ hp.loss }} Crores lost</p>
                }
              </div>
            }
          </div>
        </div>

        <!-- Modus Operandi & Scam Category Distribution (5 cols) -->
        <div class="shadow-card rounded-2xl border border-border bg-card p-6 lg:col-span-5 flex flex-col justify-between">
          <div>
            <h2 class="text-lg font-bold text-foreground">Cybercrime Vectors Breakdown</h2>
            <p class="text-xs text-muted-foreground mt-1">Share of NCRP cases by fraud type, 2025 (MHA data)</p>
          </div>

          <!-- Donut SVG -->
          <div class="relative flex items-center justify-center my-4">
            <svg class="w-52 h-52 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="35" fill="none" stroke="var(--muted)" stroke-width="14" />

              @for (sl of slices(); track sl.name) {
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  fill="none"
                  [attr.stroke]="sl.color"
                  stroke-width="14"
                  [attr.stroke-dasharray]="sl.dash"
                  [attr.stroke-dashoffset]="sl.offset"
                  class="hover:stroke-[16] transition-all cursor-pointer"
                  (mouseenter)="activeSlice.set({ name: sl.name, pct: sl.pct })"
                  (mouseleave)="activeSlice.set(null)"
                />
              }
            </svg>

            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              @if (activeSlice(); as s) {
                <span class="font-display text-2xl font-bold text-foreground">{{ s.pct }}%</span>
                <span class="text-[11px] text-muted-foreground font-semibold px-2 truncate max-w-[120px]">{{ s.name }}</span>
              } @else {
                <span class="font-display text-2xl font-bold text-foreground">100%</span>
                <span class="text-xs text-muted-foreground font-medium">Distribution</span>
              }
            </div>
          </div>

          <!-- Legend details -->
          <div class="space-y-1.5 pt-2 border-t border-border text-xs">
            @for (sl of slices(); track sl.name) {
              <div class="flex items-center justify-between p-1.5 rounded-lg bg-muted/40">
                <span class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" [class]="sl.bg"></span>
                  <span class="font-medium">{{ sl.name }}</span>
                </span>
                <span class="font-bold">{{ sl.pct }}%</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- State-Wise Cybercrime Hotspots Table (National Cybercrime Portal dataset) -->
      <div class="shadow-card rounded-2xl border border-border bg-card p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-foreground">
              State-wise Cyber Crime Cases Registered (NCRB 2024)
            </h2>
            <p class="text-xs text-muted-foreground">Top states by cases registered; scam-type labels are AI-generated (no official breakdown exists)</p>
          </div>
          <span class="rounded bg-muted px-2 py-1 text-xs font-mono font-bold text-muted-foreground">
            NCRB Dataset
          </span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-border">
          <table class="w-full text-left text-xs font-sans">
            <thead class="bg-muted text-muted-foreground border-b border-border font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th class="p-3">State / Jurisdiction</th>
                <th class="p-3">Registered Cases (2024)</th>
                <th class="p-3">Change vs 2023</th>
                <th class="p-3">Dominant Threat Vector</th>
                <th class="p-3">Intervention Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              @for (st of stateData(); track st.state) {
                <tr class="hover:bg-muted/40 transition-colors">
                  <td class="p-3 font-bold text-foreground">{{ st.state }}</td>
                  <td class="p-3 font-mono">{{ st.cases2024.toLocaleString() }}</td>
                  <td class="p-3 font-mono font-semibold" [class.text-danger]="st.cases2024 >= st.cases2023" [class.text-shield]="st.cases2024 < st.cases2023">{{ change(st) }}</td>
                  <td class="p-3">
                    <span class="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                      {{ st.dominantScam ?? 'Not available' }}
                    </span>
                    @if (st.dominantScamOrigin === 'ai') {
                      <span class="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase text-muted-foreground" title="Generated by an AI model, not an official statistic">AI</span>
                    }
                  </td>
                  <td class="p-3">
                    <span class="inline-flex items-center gap-1 text-shield font-bold">
                      <mat-icon class="!w-4 !h-4 !text-[16px]">check_circle</mat-icon>
                      <span>1930 Integrated</span>
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <!-- Sources & notes -->
      @if (national(); as n) {
        <div class="rounded-2xl border border-border bg-card p-5 text-xs text-muted-foreground space-y-2">
          <p class="font-bold text-foreground">Sources</p>
          <ul class="list-disc pl-5 space-y-1">
            @for (src of n.sources; track src.url) {
              <li><a [href]="src.url" target="_blank" rel="noreferrer" class="text-primary underline">{{ src.label }}</a></li>
            }
          </ul>
          <p class="font-bold text-foreground pt-1">Notes</p>
          <ul class="list-disc pl-5 space-y-1">
            @for (note of n.notes; track note) { <li>{{ note }}</li> }
          </ul>
        </div>
      }
    </div>
  `,
})
export class AnalyticsPage implements OnInit {
  private api = inject(ApiService);

  national = signal<National | null>(null);
  error = signal('');
  selectedYear = signal<string>('ALL');
  hoverPoint = signal<{ year: string; type: string; count: number; loss: number; x: number; y: number } | null>(null);
  activeSlice = signal<{ name: string; pct: number } | null>(null);

  get years(): string[] { return this.national()?.years.map((y) => y.year) ?? []; }
  get fiveYearHistory(): YearStat[] { return this.national()?.years ?? []; }
  stateData = computed(() => this.national()?.states ?? []);

  async ngOnInit() {
    if (!this.api.isBrowser) return;
    try {
      this.national.set((await this.api.get<{ national: National }>('/analytics')).national);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load analytics');
    }
  }

  private fmtInt = (n: number) => n.toLocaleString('en-IN');
  private lakh = (n: number) => (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' lakh';

  activeSummary = computed(() => {
    const n = this.national();
    const blank = { complaints: '—', growthText: '', lossText: '—', lossNote: '', savedText: '—', savedNote: '', firText: '—', firNote: '' };
    if (!n) return blank;
    const yrs = n.years;
    const saved = n.fundsSaved;
    const pct = (a: number, b: number) => ((a / b - 1) * 100).toFixed(1);
    const yr = this.selectedYear();
    if (yr === 'ALL') {
      const total = yrs.reduce((s, y) => s + (y.complaints ?? 0), 0);
      const last = yrs[yrs.length - 1], prev = yrs[yrs.length - 2];
      const fir = [...yrs].reverse().find((y) => y.firs && y.complaints);
      return {
        complaints: this.lakh(total),
        growthText: last?.complaints && prev?.complaints ? `+${pct(last.complaints, prev.complaints)}% in ${last.year} vs ${prev.year}` : '',
        lossText: `₹${this.fmtInt(saved.totalReported2021to2025)} Cr`,
        lossNote: 'Reported 2021–2025 (official aggregate, "more than")',
        savedText: `₹${this.fmtInt(saved.crores2025)} Cr`,
        savedNote: `${((saved.crores2025 / saved.totalReported2021to2025) * 100).toFixed(1)}% of reported amount (till Dec 2025)`,
        firText: fir ? `${((fir.firs! / fir.complaints!) * 100).toFixed(1)}%` : '—',
        firNote: fir ? `FIRs vs complaints in ${fir.year}` : 'Not published',
      };
    }
    const i = yrs.findIndex((y) => y.year === yr);
    const item = yrs[i], prev = yrs[i - 1];
    return {
      complaints: item?.complaints ? this.fmtInt(item.complaints) : 'N/A',
      growthText: item?.complaints && prev?.complaints ? `+${pct(item.complaints, prev.complaints)}% vs ${prev.year}` : 'Baseline year',
      lossText: item?.lossCrores ? `₹${this.fmtInt(Math.round(item.lossCrores))} Cr` : 'N/A',
      lossNote: item?.origin.lossCrores === 'derived' ? 'Derived, Apr–Dec 2021 only' : 'Reported financial-fraud losses',
      savedText: `₹${this.fmtInt(saved.crores2025)} Cr`,
      savedNote: 'Cumulative to Dec 2025 (year-wise not published)',
      firText: item?.firs && item.complaints ? `${((item.firs / item.complaints) * 100).toFixed(1)}%` : 'N/A',
      firNote: item?.firs ? `${this.fmtInt(item.firs)} FIRs registered` : 'FIR count not published',
    };
  });

  /** y-axis max rounded to a "nice" number so the lines always fit the data */
  private yMax = computed(() => {
    const m = Math.max(1, ...this.fiveYearHistory.flatMap((y) => [y.complaints ?? 0, y.registeredCases ?? 0]));
    const mag = Math.pow(10, Math.floor(Math.log10(m)));
    const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((c) => c * mag >= m) ?? 10;
    return step * mag;
  });
  yLabels = computed(() => {
    const f = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)));
    const m = this.yMax();
    return [f(m), f((m * 2) / 3), f(m / 3), '0'];
  });

  getY(val: number | null): number { return 200 - ((val ?? 0) / this.yMax()) * 180; }
  private x = (i: number) => 70 + i * 100;
  private pathFor(sel: (y: YearStat) => number | null): string {
    let d = '', pen = false;
    this.fiveYearHistory.forEach((y, i) => {
      const v = sel(y);
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'} ${this.x(i)} ${this.getY(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  }
  reportedPath = computed(() => this.pathFor((y) => y.complaints));
  registeredPath = computed(() => this.pathFor((y) => y.registeredCases));
  areaPoints = computed(() => {
    const pts = this.fiveYearHistory.map((y, i) => ({ x: this.x(i), v: y.registeredCases })).filter((p) => p.v !== null);
    if (!pts.length) return '';
    return [`${pts[0].x},200`, ...pts.map((p) => `${p.x},${this.getY(p.v).toFixed(1)}`), `${pts[pts.length - 1].x},200`].join(' ');
  });

  private palette = [
    { color: 'var(--chart-2)', bg: 'bg-chart-2' }, { color: 'var(--chart-1)', bg: 'bg-chart-1' },
    { color: 'var(--chart-3)', bg: 'bg-chart-3' }, { color: 'var(--chart-4)', bg: 'bg-chart-4' },
  ];
  slices = computed(() => {
    const cats = this.national()?.categories2025 ?? [];
    const C = 2 * Math.PI * 35;
    let acc = 0;
    return cats.map((c, i) => {
      const len = (c.pct / 100) * C;
      const out = { name: c.name, pct: c.pct, dash: `${(len - 2).toFixed(2)} ${C.toFixed(2)}`, offset: (-acc).toFixed(2), ...this.palette[i % 4] };
      acc += len;
      return out;
    });
  });

  change(st: StateFraudData): string {
    const p = (st.cases2024 / st.cases2023 - 1) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
  }
}
