import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthError, AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-12">
      <!-- Background Cyber Grid & Glow -->
      <div class="grid-bg absolute inset-0 opacity-40 pointer-events-none"></div>
      <div class="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-shield/15 blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl pointer-events-none"></div>

      <!-- Main Login Container -->
      <div class="relative z-10 w-full max-w-md">
        <!-- Brand Badge & Title -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-navy text-shield border border-shield/30 shadow-card mb-4">
            <mat-icon class="!w-10 !h-10 !text-[40px] leading-none">verified_user</mat-icon>
          </div>
          <h1 class="font-display text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            CyberAid
          </h1>
          <p class="mt-1 text-sm font-semibold tracking-wide text-shield uppercase">
            Scam Detection & Incident Guidance Platform
          </p>
          <p class="mt-2 text-xs text-muted-foreground">
            CSE Mini Project | P. R. Pote Patil College of Engg. & Mgmt. (2026-27)
          </p>
        </div>

        <!-- Auth Card -->
        <div class="shadow-card rounded-2xl border border-border bg-card p-6 md:p-8 transition-all">
          <!-- Auth Mode Toggle -->
          <div class="flex rounded-xl bg-muted p-1 mb-6">
            <button
              type="button"
              (click)="isSignUp.set(false)"
              class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
              [class.bg-card]="!isSignUp()"
              [class.text-foreground]="!isSignUp()"
              [class.shadow-sm]="!isSignUp()"
              [class.text-muted-foreground]="isSignUp()"
            >
              Sign In
            </button>
            <button
              type="button"
              (click)="isSignUp.set(true)"
              class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
              [class.bg-card]="isSignUp()"
              [class.text-foreground]="isSignUp()"
              [class.shadow-sm]="isSignUp()"
              [class.text-muted-foreground]="!isSignUp()"
            >
              Create Account
            </button>
          </div>

          <!-- Official Google Sign-In Button -->
          <button
            type="button"
            (click)="handleGoogleSignIn()"
            [disabled]="isLoading()"
            class="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-card hover:bg-muted py-3 px-4 font-semibold text-foreground text-sm shadow-xs transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google (Enables Gmail Scan)</span>
          </button>

          <!-- Divider -->
          <div class="relative my-6 text-center">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-border"></div>
            </div>
            <span class="relative bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
              or continue with email
            </span>
          </div>

          @if (step() !== 'credentials') {
            <!-- E-mail OTP step (verify account / reset password) -->
            <form (submit)="handleOtpSubmit($event)" class="space-y-4">
              <div class="rounded-xl border border-shield/30 bg-shield/10 p-3 text-xs text-foreground">
                <p class="font-bold">{{ step() === 'reset' ? 'Reset your password' : 'Verify your e-mail' }}</p>
                <p class="mt-1 text-muted-foreground">We sent a 6-digit code to <span class="font-semibold text-foreground">{{ email() }}</span>. It expires in 10 minutes.</p>
                @if (devCode()) { <p class="mt-1 font-mono text-warning">Dev mode code: {{ devCode() }}</p> }
              </div>
              <div>
                <label for="otpCode" class="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Verification code</label>
                <input id="otpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [value]="code()" (input)="setCode($event)" required placeholder="123456"
                  class="w-full rounded-xl border border-input bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-foreground outline-none focus:ring-2 focus:ring-ring transition-all" />
              </div>
              @if (step() === 'reset') {
                <div>
                  <label for="newPassword" class="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">New password</label>
                  <input id="newPassword" type="password" [value]="password()" (input)="setPassword($event)" required minlength="8" placeholder="At least 8 characters"
                    class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-all" />
                </div>
              }
              @if (errorMessage()) {
                <div class="flex items-center gap-2 rounded-lg bg-danger/10 p-3 text-xs text-danger border border-danger/20">
                  <mat-icon class="!w-4 !h-4 !text-[16px] shrink-0">error</mat-icon><span>{{ errorMessage() }}</span>
                </div>
              }
              @if (infoMessage()) { <div class="rounded-lg bg-shield/10 p-3 text-xs text-shield border border-shield/20">{{ infoMessage() }}</div> }
              <button type="submit" [disabled]="isLoading() || code().length !== 6"
                class="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 font-bold text-primary-foreground text-sm shadow-md transition-all hover:opacity-95 disabled:opacity-50">
                <mat-icon class="!w-5 !h-5 !text-[20px]">verified_user</mat-icon>
                <span>{{ isLoading() ? 'Checking…' : step() === 'reset' ? 'Set new password' : 'Verify & continue' }}</span>
              </button>
              <div class="flex items-center justify-between text-xs">
                <button type="button" (click)="backToCredentials()" class="text-muted-foreground hover:text-foreground">← Back</button>
                <button type="button" (click)="resend()" [disabled]="resendIn() > 0 || isLoading()" class="font-bold text-primary disabled:text-muted-foreground disabled:cursor-not-allowed">
                  {{ resendIn() > 0 ? 'Resend code in ' + resendIn() + 's' : 'Resend code' }}
                </button>
              </div>
            </form>
          } @else {
          <!-- Email/Password Form -->
          <form (submit)="handleEmailAuth($event)" class="space-y-4">
            @if (isSignUp()) {
              <div>
                <label for="userFullName" class="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Full Name
                </label>
                <input
                  id="userFullName"
                  type="text"
                  [value]="fullName()"
                  (input)="setFullName($event)"
                  required
                  placeholder="Your full name"
                  class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            }

            <div>
              <label for="userEmail" class="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Email Address
              </label>
              <input
                id="userEmail"
                type="email"
                [value]="email()"
                (input)="setEmail($event)"
                required
                placeholder="name@organization.com"
                class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            <div>
              <label for="userPassword" class="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                id="userPassword"
                type="password"
                [value]="password()"
                (input)="setPassword($event)"
                required
                placeholder="••••••••"
                class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring transition-all"
              />
              @if (!isSignUp()) {
                <button type="button" (click)="startReset()" class="mt-1.5 text-xs font-semibold text-primary hover:underline">Forgot password?</button>
              }
            </div>

            @if (errorMessage()) {
              <div class="flex items-center gap-2 rounded-lg bg-danger/10 p-3 text-xs text-danger border border-danger/20">
                <mat-icon class="!w-4 !h-4 !text-[16px] shrink-0">error</mat-icon>
                <span>{{ errorMessage() }}</span>
              </div>
            }

            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 font-bold text-primary-foreground text-sm shadow-md transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
            >
              @if (isLoading()) {
                <mat-icon class="!w-5 !h-5 !text-[20px] animate-spin">refresh</mat-icon>
                <span>Authenticating…</span>
              } @else {
                <mat-icon class="!w-5 !h-5 !text-[20px]">
                  {{ isSignUp() ? 'person_add' : 'login' }}
                </mat-icon>
                <span>{{ isSignUp() ? 'Create Free Account' : 'Sign In to Dashboard' }}</span>
              }
            </button>
          </form>
          }

          <!-- Quick Test / Demo Login Access -->
          <div class="mt-6 pt-5 border-t border-border">
            <p class="text-xs text-center text-muted-foreground mb-2">
              Evaluating or Testing? Instant 1-Click Access:
            </p>
            <button
              type="button"
              (click)="handleDemoLogin('Demo User')"
              class="w-full flex items-center justify-center gap-2 rounded-xl border border-shield/40 bg-shield/10 hover:bg-shield/20 py-2.5 px-3 text-xs font-bold text-shield transition-all active:scale-95"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">bolt</mat-icon>
              <span>Continue as guest (no sign-in)</span>
            </button>
          </div>
        </div>

        <!-- Security & Helpline Pill -->
        <div class="mt-6 flex items-center justify-between text-xs text-muted-foreground px-2">
          <span class="flex items-center gap-1">
            <mat-icon class="!w-4 !h-4 !text-[16px] text-shield">lock</mat-icon>
            <span>256-bit AES Encryption</span>
          </span>
          <a href="tel:1930" class="flex items-center gap-1 text-danger font-semibold hover:underline">
            <mat-icon class="!w-4 !h-4 !text-[16px]">call</mat-icon>
            <span>Helpline 1930</span>
          </a>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  isSignUp = signal<boolean>(false);
  step = signal<'credentials' | 'verify' | 'reset'>('credentials');
  fullName = signal<string>('');
  email = signal<string>('');
  password = signal<string>('');
  code = signal<string>('');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  infoMessage = signal<string>('');
  devCode = signal<string>('');
  resendIn = signal<number>(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // already signed in (e.g. page refresh landed here): go to the app
    effect(() => { if (this.authService.authReady() && this.authService.isLoggedIn()) this.router.navigate(['/verify']); });
  }

  setFullName(e: Event) { this.fullName.set((e.target as HTMLInputElement).value); }
  setEmail(e: Event) { this.email.set((e.target as HTMLInputElement).value); }
  setPassword(e: Event) { this.password.set((e.target as HTMLInputElement).value); }
  setCode(e: Event) { this.code.set((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)); }

  private friendly(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    const map: Record<string, string> = {
      'auth/popup-closed-by-user': 'Sign-in window was closed before finishing.',
      'auth/popup-blocked': 'Your browser blocked the sign-in pop-up. Allow pop-ups and retry.',
      'auth/unauthorized-domain': 'This domain is not authorised in Firebase. Add it under Authentication → Settings → Authorized domains.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] ?? (err instanceof Error ? err.message : 'Authentication error. Please try again.');
  }

  private startCountdown(seconds: number) {
    if (this.timer) clearInterval(this.timer);
    this.resendIn.set(seconds);
    if (seconds <= 0) return;
    this.timer = setInterval(() => {
      this.resendIn.update((v) => v - 1);
      if (this.resendIn() <= 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    }, 1000);
  }

  private toOtpStep(step: 'verify' | 'reset', resendIn: number, devCode?: string) {
    this.step.set(step); this.code.set(''); this.infoMessage.set(''); this.errorMessage.set('');
    this.devCode.set(devCode ?? '');
    if (step === 'reset') this.password.set('');
    this.startCountdown(resendIn);
  }

  backToCredentials() { this.step.set('credentials'); this.errorMessage.set(''); this.infoMessage.set(''); this.code.set(''); }

  async handleGoogleSignIn() {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.authService.signInWithGoogle();
      this.router.navigate(['/verify']);
    } catch (err) {
      this.errorMessage.set(this.friendly(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async handleEmailAuth(event: Event) {
    event.preventDefault();
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      if (this.isSignUp()) {
        const r = await this.authService.register(this.fullName().trim(), this.email().trim(), this.password());
        this.toOtpStep('verify', r.resendIn, r.devCode);
      } else {
        await this.authService.login(this.email().trim(), this.password());
        this.router.navigate(['/verify']);
      }
    } catch (err) {
      if (err instanceof AuthError && err.needsVerification) { this.toOtpStep('verify', err.resendIn, err.devCode); this.infoMessage.set('Your e-mail is not verified yet. Enter the code we just sent.'); }
      else this.errorMessage.set(this.friendly(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async startReset() {
    if (!this.email().trim()) { this.errorMessage.set('Enter your e-mail first, then tap "Forgot password?".'); return; }
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const r = await this.authService.forgotPassword(this.email().trim());
      this.toOtpStep('reset', r.resendIn, r.devCode);
      this.infoMessage.set(r.message);
    } catch (err) { this.errorMessage.set(this.friendly(err)); }
    finally { this.isLoading.set(false); }
  }

  async handleOtpSubmit(event: Event) {
    event.preventDefault();
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      if (this.step() === 'reset') await this.authService.resetPassword(this.email().trim(), this.code(), this.password());
      else await this.authService.verifyOtp(this.email().trim(), this.code());
      this.router.navigate(['/verify']);
    } catch (err) { this.errorMessage.set(this.friendly(err)); }
    finally { this.isLoading.set(false); }
  }

  async resend() {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const r = await this.authService.resendOtp(this.email().trim(), this.step() === 'reset' ? 'reset_password' : 'verify_email');
      this.devCode.set(r.devCode ?? '');
      this.infoMessage.set('A new code was sent if the account exists.');
      this.startCountdown(r.resendIn);
    } catch (err) {
      if (err instanceof AuthError && err.retryAfter) this.startCountdown(err.retryAfter);
      this.errorMessage.set(this.friendly(err));
    } finally { this.isLoading.set(false); }
  }

  async handleDemoLogin(name: string) {
    this.errorMessage.set('');
    try { await this.authService.loginAsDemo(name); this.router.navigate(['/verify']); }
    catch (err) { this.errorMessage.set(this.friendly(err)); }
  }
}
