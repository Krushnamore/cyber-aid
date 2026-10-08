import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api';

interface Q { id: string; q: string; options: string[]; topic: string }
interface Result { id: string; correct: boolean; correctIndex: number; chosen: number; explanation: string }
interface Graded { score: number; total: number; results: Result[]; saved: boolean; attempts: number; best: number; source: string }

@Component({
  selector: 'app-quiz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="shadow-card rounded-2xl border border-border bg-card p-5 space-y-3">
      <div class="flex items-center gap-2 text-sm font-bold text-foreground">
        <mat-icon class="!w-5 !h-5 !text-[20px] text-primary">quiz</mat-icon>
        <span>Cyber Awareness Quiz</span>
      </div>
      <p class="text-xs text-muted-foreground">Test yourself on UPI, OTP, KYC and digital-arrest scams. Scores are saved to the community leaderboard.</p>
      <div class="flex gap-2">
        <button type="button" (click)="start(false)" class="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">Start quiz</button>
        <button type="button" (click)="start(true)" class="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground hover:bg-card" title="Fresh questions written by AI (needs a Grok/Groq key)">AI quiz</button>
      </div>
      @if (board().length) {
        <div class="pt-2 border-t border-border space-y-1">
          <p class="text-[11px] font-bold uppercase text-muted-foreground">Leaderboard</p>
          @for (b of board(); track $index) {
            <div class="flex items-center justify-between text-xs"><span class="truncate max-w-[10rem]">{{ $index + 1 }}. {{ b.name }}</span><span class="font-mono font-bold text-shield">{{ b.pct }}%</span></div>
          }
        </div>
      }
    </div>

    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close()">
        <div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-card space-y-4" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-extrabold text-foreground">Cyber Awareness Quiz @if (source() === 'ai') { <span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">AI-written</span> }</h3>
            <button type="button" (click)="close()" aria-label="Close"><mat-icon>close</mat-icon></button>
          </div>

          @if (loading()) { <p class="text-sm text-muted-foreground">Loading questions…</p> }
          @if (error()) { <p class="text-xs font-semibold text-danger">{{ error() }}</p> }

          @if (!graded() && questions().length) {
            @let q = questions()[index()];
            <div class="space-y-3">
              <div class="flex justify-between text-[11px] font-bold uppercase text-muted-foreground"><span>Question {{ index() + 1 }} / {{ questions().length }}</span><span>{{ q.topic }}</span></div>
              <div class="h-1.5 rounded-full bg-muted overflow-hidden"><div class="h-full bg-primary transition-all" [style.width.%]="((index() + 1) / questions().length) * 100"></div></div>
              <p class="text-sm font-semibold text-foreground">{{ q.q }}</p>
              <div class="space-y-2">
                @for (o of q.options; track $index) {
                  <button type="button" (click)="choose(q.id, $index)"
                    class="w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all"
                    [class.border-primary]="answers()[q.id] === $index" [class.bg-primary/10]="answers()[q.id] === $index"
                    [class.border-border]="answers()[q.id] !== $index" [class.hover:bg-muted]="answers()[q.id] !== $index">{{ o }}</button>
                }
              </div>
              <div class="flex justify-between pt-1">
                <button type="button" [disabled]="index() === 0" (click)="index.set(index() - 1)" class="text-xs font-bold text-muted-foreground disabled:opacity-40">← Back</button>
                @if (index() < questions().length - 1) {
                  <button type="button" [disabled]="answers()[q.id] === undefined" (click)="index.set(index() + 1)" class="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">Next →</button>
                } @else {
                  <button type="button" [disabled]="answers()[q.id] === undefined || loading()" (click)="submit()" class="rounded-lg bg-shield px-4 py-2 text-xs font-bold text-shield-foreground disabled:opacity-40">Submit</button>
                }
              </div>
            </div>
          }

          @if (graded(); as g) {
            <div class="text-center space-y-1">
              <p class="text-4xl font-extrabold" [class.text-shield]="g.score / g.total >= 0.6" [class.text-danger]="g.score / g.total < 0.6">{{ g.score }}/{{ g.total }}</p>
              <p class="text-xs text-muted-foreground">
                @if (g.saved) { Saved to leaderboard · your best {{ g.best }}% · {{ g.attempts }} attempt(s) } @else { Sign in to save your score }
              </p>
            </div>
            <div class="space-y-3">
              @for (r of g.results; track r.id; let i = $index) {
                <div class="rounded-xl border p-3 text-xs space-y-1" [class.border-shield/40]="r.correct" [class.border-danger/40]="!r.correct">
                  <p class="font-bold text-foreground">{{ i + 1 }}. {{ questions()[i]?.q }}</p>
                  <p [class.text-shield]="r.correct" [class.text-danger]="!r.correct">{{ r.correct ? '✔ Correct' : '✘ Your answer: ' + (r.chosen >= 0 ? questions()[i]?.options?.[r.chosen] : 'none') }}</p>
                  @if (!r.correct) { <p class="text-foreground/90">Correct: {{ questions()[i]?.options?.[r.correctIndex] }}</p> }
                  <p class="text-muted-foreground">{{ r.explanation }}</p>
                </div>
              }
            </div>
            <button type="button" (click)="start(source() === 'ai')" class="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground">Try another quiz</button>
          }
        </div>
      </div>
    }
  `,
})
export class QuizComponent {
  private api = inject(ApiService);
  open = signal(false);
  loading = signal(false);
  error = signal('');
  questions = signal<Q[]>([]);
  answers = signal<Record<string, number>>({});
  index = signal(0);
  graded = signal<Graded | null>(null);
  source = signal<'bank' | 'ai'>('bank');
  board = signal<{ name: string; pct: number }[]>([]);
  private sessionId = '';

  constructor() { void this.loadBoard(); }

  private async loadBoard() {
    if (!this.api.isBrowser) return;
    try { this.board.set((await this.api.get<{ top: { name: string; pct: number }[] }>('/quiz/leaderboard')).top.slice(0, 5)); } catch { /* optional */ }
  }

  async start(ai: boolean) {
    this.open.set(true); this.loading.set(true); this.error.set(''); this.graded.set(null);
    this.answers.set({}); this.index.set(0); this.questions.set([]);
    try {
      const r = await this.api.get<{ sessionId: string; source: 'bank' | 'ai'; questions: Q[] }>(`/quiz/start?count=5${ai ? '&ai=1' : ''}`);
      this.sessionId = r.sessionId; this.source.set(r.source); this.questions.set(r.questions);
      if (ai && r.source === 'bank') this.error.set('AI quiz is unavailable (no Grok/Groq key configured or the service failed), so a curated quiz was loaded.');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Could not load quiz'); }
    this.loading.set(false);
  }

  choose(id: string, i: number) { this.answers.update((a) => ({ ...a, [id]: i })); }

  async submit() {
    this.loading.set(true);
    try {
      this.graded.set(await this.api.post<Graded>('/quiz/submit', { sessionId: this.sessionId, answers: this.answers() }));
      void this.loadBoard();
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Could not submit'); }
    this.loading.set(false);
  }

  close() { this.open.set(false); }
}
