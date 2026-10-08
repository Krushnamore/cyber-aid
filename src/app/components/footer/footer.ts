import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <footer class="border-t border-navy-foreground/10 bg-navy-deep text-navy-foreground">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 md:flex-row">
        <!-- Links -->
        <div class="flex flex-wrap justify-center items-center gap-4 text-sm text-navy-foreground/80">
          <a href="#" class="hover:text-shield transition-colors">About</a>
          <span class="text-navy-foreground/30">|</span>
          <a
            href="https://cybercrime.gov.in"
            target="_blank"
            rel="noreferrer"
            class="hover:text-shield font-medium transition-colors"
          >
            NCRP Portal (1930)
          </a>
          <span class="text-navy-foreground/30">|</span>
          <a href="#" class="hover:text-shield transition-colors">Terms</a>
          <span class="text-navy-foreground/30">|</span>
          <a href="#" class="hover:text-shield transition-colors">Privacy</a>
        </div>

        <!-- Social / Badges -->
        <div class="flex items-center gap-3">
          <a
            href="https://cybercrime.gov.in"
            target="_blank"
            rel="noreferrer"
            aria-label="National Cyber Crime Reporting Portal"
            class="rounded-full bg-navy-foreground/10 p-2 hover:bg-shield hover:text-shield-foreground transition-all duration-200"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px] block leading-none">policy</mat-icon>
          </a>
          <a
            href="tel:1930"
            aria-label="Call 1930 helpline"
            class="rounded-full bg-navy-foreground/10 p-2 hover:bg-shield hover:text-shield-foreground transition-all duration-200"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px] block leading-none">call</mat-icon>
          </a>
          <a
            href="#"
            aria-label="Share platform"
            class="rounded-full bg-navy-foreground/10 p-2 hover:bg-shield hover:text-shield-foreground transition-all duration-200"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px] block leading-none">share</mat-icon>
          </a>
        </div>

        <!-- Copyright -->
        <p class="text-sm text-navy-foreground/60 text-center md:text-right">
          © 2026 CyberAid | Proactive Cyber Defense
        </p>
      </div>
    </footer>
  `,
})
export class Footer {}
