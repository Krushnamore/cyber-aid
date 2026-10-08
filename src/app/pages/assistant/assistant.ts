import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api';
import { ChatMessage } from '../../models/scam.model';

@Component({
  selector: 'app-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-10">
      <!-- Header Section -->
      <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span class="inline-flex items-center gap-2 font-semibold text-shield text-sm md:text-base">
            <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">emergency</mat-icon>
            <span>Golden Hour Rescue</span>
          </span>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            AI Incident Assistant
          </h1>
          <p class="mt-2 text-lg text-muted-foreground">
            Clear, calm recovery steps — no jargon.
          </p>
        </div>

        <a
          href="tel:1930"
          class="flex items-center gap-2 self-start rounded-xl bg-danger px-5 py-3 font-bold text-danger-foreground shadow-sm hover:opacity-95 active:scale-95 transition-all"
        >
          <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">phone</mat-icon>
          <span>Call 1930 now</span>
        </a>
      </div>

      <!-- Quick Issue Prompt Pills -->
      <div class="flex flex-wrap gap-2">
        @for (prompt of quickPrompts; track prompt) {
          <button
            type="button"
            (click)="sendMessage(prompt)"
            class="rounded-full border-2 border-primary/20 bg-card px-4 py-2 text-sm md:text-base font-medium text-foreground transition-all hover:border-shield hover:bg-accent active:scale-95"
          >
            {{ prompt }}
          </button>
        }
      </div>

      <!-- Chat Container -->
      <div class="shadow-card mt-6 flex h-[540px] flex-col rounded-2xl border border-border bg-card overflow-hidden">
        <!-- Messages Scroll View -->
        <div #scrollContainer class="flex-1 space-y-4 overflow-y-auto p-4 md:p-6 scroll-smooth">
          @for (msg of messages(); track $index) {
            <div
              class="flex gap-3 transition-opacity duration-200"
              [class.justify-end]="msg.role === 'user'"
            >
              @if (msg.role === 'bot') {
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-shield text-shield-foreground shadow-sm">
                  <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">support_agent</mat-icon>
                </div>
              }

              <div
                class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-base md:text-lg leading-relaxed shadow-xs"
                [class.bg-primary]="msg.role === 'user'"
                [class.text-primary-foreground]="msg.role === 'user'"
                [class.bg-muted]="msg.role === 'bot'"
                [class.text-foreground]="msg.role === 'bot'"
              >
                {{ msg.text }}
              </div>
            </div>
          }

          <!-- Typing Indicator -->
          @if (isTyping()) {
            <div class="flex gap-3 items-center">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-shield text-shield-foreground shadow-sm">
                <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">support_agent</mat-icon>
              </div>
              <div class="flex gap-1.5 rounded-2xl bg-muted px-4 py-3 items-center">
                <span class="h-2.5 w-2.5 rounded-full bg-muted-foreground/80 animate-typing-1"></span>
                <span class="h-2.5 w-2.5 rounded-full bg-muted-foreground/80 animate-typing-2"></span>
                <span class="h-2.5 w-2.5 rounded-full bg-muted-foreground/80 animate-typing-3"></span>
              </div>
            </div>
          }
        </div>

        <!-- Input Form -->
        <form (submit)="onSubmit($event)" class="flex gap-2 border-t border-border p-3 bg-card">
          <input
            #textInput
            type="text"
            [value]="userInput()"
            (input)="onInput($event)"
            placeholder="Describe what happened…"
            class="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base md:text-lg text-foreground outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          />
          <button
            type="submit"
            aria-label="Send message"
            [disabled]="isTyping() || !userInput().trim()"
            class="flex items-center justify-center rounded-xl bg-shield px-5 text-shield-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">send</mat-icon>
          </button>
        </form>
      </div>
    </div>
  `,
})
export class AssistantPage {
  private api = inject(ApiService);
  source = signal<'grok' | 'groq' | 'playbook' | ''>('');

  scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  textInput = viewChild<ElementRef<HTMLInputElement>>('textInput');

  userInput = signal('');
  isTyping = signal(false);

  messages = signal<ChatMessage[]>([
    {
      role: 'bot',
      text: "Hello, I'm your CyberAid assistant. Take a breath — we'll fix this together, step by step. What happened?",
    },
  ]);

  quickPrompts = [
    'I clicked a suspicious link',
    'I shared my UPI PIN',
    'Money was debited without my consent',
    'I shared my OTP',
    'Someone is blackmailing me online',
  ];

  private typewriterInterval: ReturnType<typeof setInterval> | null = null;

  onInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.userInput.set(target.value);
  }

  onSubmit(event: Event) {
    event.preventDefault();
    this.sendMessage(this.userInput());
  }

  async sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || this.isTyping()) return;

    this.messages.update((list) => [...list, { role: 'user', text: trimmed }]);
    this.userInput.set('');
    this.isTyping.set(true);
    this.scrollToBottom();

    let reply: string;
    try {
      const res = await this.api.post<{ reply: string; source: 'grok' | 'groq' | 'playbook' }>('/assistant/chat', {
        messages: this.messages().slice(-14),
      });
      reply = res.reply;
      this.source.set(res.source);
    } catch (err) {
      reply =
        (err instanceof Error ? err.message : 'Something went wrong.') +
        '\n\nIf money was lost, do not wait: call 1930 now and report at cybercrime.gov.in.';
    }
    this.isTyping.set(false);
    this.typeOut(reply);
  }

  private typeOut(response: string) {
    this.messages.update((list) => [...list, { role: 'bot', text: '' }]);
    this.scrollToBottom();
    let charIndex = 0;
    if (this.typewriterInterval) clearInterval(this.typewriterInterval);
    this.typewriterInterval = setInterval(() => {
      charIndex += 4;
      this.messages.update((list) => {
        const updated = [...list];
        updated[updated.length - 1] = { role: 'bot', text: response.slice(0, charIndex) };
        return updated;
      });
      this.scrollToBottom();
      if (charIndex >= response.length) {
        if (this.typewriterInterval) {
          clearInterval(this.typewriterInterval);
          this.typewriterInterval = null;
        }
        this.textInput()?.nativeElement.focus();
      }
    }, 15);
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.scrollContainer()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 10);
  }
}
