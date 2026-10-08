import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <header class="sticky top-0 z-50 border-b border-navy-foreground/10 bg-navy-deep/95 text-navy-foreground backdrop-blur transition-all duration-200">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <!-- Logo -->
        <a routerLink="/verify" class="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-navy-foreground hover:opacity-95 transition-opacity">
          <mat-icon class="!w-7 !h-7 !text-[28px] text-shield leading-none">verified_user</mat-icon>
          <span>CyberAid</span>
        </a>

        <!-- Desktop Navigation (Shown if logged in) -->
        @if (authService.isLoggedIn()) {
          <nav class="hidden gap-1 md:flex items-center">
            @for (item of navItems; track item.to) {
              <a
                [routerLink]="item.to"
                routerLinkActive="bg-navy-foreground/10 !text-navy-foreground font-semibold"
                [routerLinkActiveOptions]="{ exact: item.exact }"
                class="rounded-lg px-3.5 py-2 text-xs md:text-sm font-medium text-navy-foreground/75 transition-colors hover:text-navy-foreground flex items-center gap-1.5"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
              </a>
            }
          </nav>
        }

        <!-- Right Side: User Profile & Helpline -->
        <div class="hidden md:flex items-center gap-3">
          <a
            href="tel:1930"
            class="flex items-center gap-1.5 rounded-lg bg-shield px-3 py-1.5 text-xs font-bold text-shield-foreground shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">phone</mat-icon>
            <span>1930</span>
          </a>

          @if (authService.currentUser(); as user) {
            <!-- Profile dropdown / logout -->
            <div class="flex items-center gap-2 pl-2 border-l border-navy-foreground/15">
              <img
                [src]="user.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'"
                [alt]="user.displayName || 'User'"
                class="h-8 w-8 rounded-full border border-shield/40 object-cover bg-navy"
              />
              <span class="text-xs font-semibold text-navy-foreground truncate max-w-[120px]">
                {{ user.displayName || 'Member' }}
              </span>
              <button
                type="button"
                (click)="authService.logout()"
                title="Sign out"
                class="p-1 rounded-lg text-navy-foreground/60 hover:text-danger hover:bg-navy-foreground/10 transition-colors"
                aria-label="Sign out"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px]">logout</mat-icon>
              </button>
            </div>
          } @else {
            <a
              routerLink="/login"
              class="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              Sign In
            </a>
          }
        </div>

        <!-- Mobile Menu Toggle Button -->
        <button
          type="button"
          class="flex items-center justify-center p-2 rounded-lg text-navy-foreground hover:bg-navy-foreground/10 md:hidden transition-colors"
          aria-label="Toggle Menu"
          (click)="toggleMenu()"
        >
          <mat-icon class="!w-6 !h-6 !text-[24px]">
            {{ isMobileOpen() ? 'close' : 'menu' }}
          </mat-icon>
        </button>
      </div>

      <!-- Mobile Dropdown Navigation -->
      @if (isMobileOpen()) {
        <nav class="flex flex-col gap-1 px-4 pb-4 md:hidden border-t border-navy-foreground/10 pt-2 animate-in slide-in-from-top duration-200">
          @if (authService.isLoggedIn()) {
            @for (item of navItems; track item.to) {
              <a
                [routerLink]="item.to"
                routerLinkActive="bg-navy-foreground/15 !text-navy-foreground font-bold"
                [routerLinkActiveOptions]="{ exact: item.exact }"
                (click)="closeMenu()"
                class="flex items-center gap-2 rounded-lg px-3 py-2.5 text-base font-medium text-navy-foreground/80 hover:bg-navy-foreground/10 hover:text-navy-foreground transition-colors"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px]">{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
              </a>
            }

            <div class="mt-2 pt-2 border-t border-navy-foreground/15 flex items-center justify-between">
              <span class="text-xs text-navy-foreground/70">
                Logged in as {{ authService.currentUser()?.displayName }}
              </span>
              <button
                type="button"
                (click)="authService.logout(); closeMenu()"
                class="flex items-center gap-1 text-xs text-danger font-bold"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">logout</mat-icon>
                <span>Sign Out</span>
              </button>
            </div>
          } @else {
            <a
              routerLink="/login"
              (click)="closeMenu()"
              class="mt-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground text-center"
            >
              <mat-icon class="!w-5 !h-5 !text-[20px]">login</mat-icon>
              <span>Sign In / Create Account</span>
            </a>
          }

          <a
            href="tel:1930"
            class="mt-2 flex items-center justify-center gap-2 rounded-lg bg-shield px-4 py-2.5 font-semibold text-shield-foreground text-center"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px]">phone</mat-icon>
            <span>Dial Helpline 1930</span>
          </a>
        </nav>
      }
    </header>
  `,
})
export class Navbar {
  authService = inject(AuthService);
  isMobileOpen = signal(false);

  navItems = [
    { to: '/verify', label: 'Forensic Hub', icon: 'biotech', exact: false },
    { to: '/gmail', label: 'Gmail Radar', icon: 'mail_lock', exact: false },
    { to: '/community', label: 'Community Feed', icon: 'groups', exact: false },
    { to: '/assistant', label: 'Incident Assistant', icon: 'support_agent', exact: false },
    { to: '/analytics', label: 'Analytics', icon: 'insights', exact: false },
  ];

  toggleMenu() {
    this.isMobileOpen.update((v) => !v);
  }

  closeMenu() {
    this.isMobileOpen.set(false);
  }
}
