import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { FIREBASE_CONFIG } from '../firebase-config';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  headline?: string;
  provider: 'google' | 'password' | 'demo';
}

interface ServerUser { id: string; email: string | null; name: string; avatar: string; headline: string; provider: AppUser['provider'] }

/** Thrown for any failed auth call. Carries the extra fields the login UI needs for the OTP step. */
export class AuthError extends Error {
  needsVerification = false;
  email = '';
  resendIn = 0;
  retryAfter = 0;
  devCode?: string;
  constructor(message: string, public status = 0) { super(message); }
}

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Session = JWT in an HttpOnly cookie issued by our API (never readable by page scripts).
 * Firebase is used only for (a) the "Sign in with Google" popup, whose ID token is exchanged for OUR JWT,
 * and (b) the Gmail read-only consent that yields a short-lived Gmail access token kept in memory.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private gmailToken: { token: string; at: number } | null = null;

  currentUser = signal<AppUser | null>(null);
  isLoggedIn = computed(() => !!this.currentUser());
  authReady = signal<boolean>(false);
  hasGmailAccess = signal<boolean>(false);

  constructor() {
    if (this.isBrowser) void this.restoreSession();
    else this.authReady.set(true);
  }

  private map(u: ServerUser): AppUser {
    return { uid: u.id, email: u.email, displayName: u.name, photoURL: u.avatar, headline: u.headline, provider: u.provider };
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch('/api/auth' + path, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'cyberaid' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch { throw new AuthError('Cannot reach the CyberAid server. Check your connection.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new AuthError(data?.error || `Request failed (${res.status})`, res.status);
      e.needsVerification = !!data?.needsVerification; e.email = data?.email ?? ''; e.resendIn = data?.resendIn ?? 0; e.retryAfter = data?.retryAfter ?? 0; e.devCode = data?.devCode;
      throw e;
    }
    return data as T;
  }

  private async restoreSession() {
    try {
      const { user } = await this.call<{ user: ServerUser | null }>('GET', '/me');
      this.currentUser.set(user ? this.map(user) : null);
    } catch { this.currentUser.set(null); }
    this.authReady.set(true);
  }

  private accept(user: ServerUser) { this.currentUser.set(this.map(user)); }

  /** Step 1 of sign-up. The account stays unverified until the e-mailed OTP is confirmed. */
  register(name: string, email: string, password: string) {
    return this.call<{ needsVerification: true; email: string; resendIn: number; expiresInMinutes: number; devCode?: string }>('POST', '/register', { name, email, password });
  }

  /** Step 2: confirm the 6-digit code; on success the server sets the session cookie. */
  async verifyOtp(email: string, code: string) { this.accept((await this.call<{ user: ServerUser }>('POST', '/verify-otp', { email, code })).user); }

  resendOtp(email: string, purpose: 'verify_email' | 'reset_password' = 'verify_email') {
    return this.call<{ ok: boolean; resendIn: number; devCode?: string }>('POST', '/resend-otp', { email, purpose });
  }

  /** Throws AuthError with needsVerification=true when the e-mail is not verified yet (a new code has been sent). */
  async login(email: string, password: string) { this.accept((await this.call<{ user: ServerUser }>('POST', '/login', { email, password })).user); }

  forgotPassword(email: string) { return this.call<{ ok: boolean; message: string; resendIn: number; devCode?: string }>('POST', '/forgot-password', { email }); }

  async resetPassword(email: string, code: string, newPassword: string) {
    this.accept((await this.call<{ user: ServerUser }>('POST', '/reset-password', { email, code, newPassword })).user);
  }

  async loginAsDemo(name = 'Guest') { this.accept((await this.call<{ user: ServerUser }>('POST', '/demo', { name })).user); }

  /* ------------------------------------------------------------ Google (Firebase popup -> our JWT) */
  private firebaseAuth() {
    return getAuth(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));
  }
  private provider(withGmail: boolean) {
    const p = new GoogleAuthProvider();
    if (withGmail) p.addScope(GMAIL_SCOPE);
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }

  async signInWithGoogle(): Promise<void> {
    const result = await signInWithPopup(this.firebaseAuth(), this.provider(false));
    this.accept((await this.call<{ user: ServerUser }>('POST', '/google', { idToken: await result.user.getIdToken() })).user);
  }

  /** Re-prompts Google consent for read-only Gmail access. Independent of the CyberAid session. */
  async connectGmail(): Promise<void> {
    const result = await signInWithPopup(this.firebaseAuth(), this.provider(true));
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) throw new Error('Google did not return Gmail access.');
    this.gmailToken = { token: cred.accessToken, at: Date.now() };
    this.hasGmailAccess.set(true);
  }

  /** Gmail access token (valid ~1h, memory only). Null until the user connects Gmail. */
  getAccessToken(): string | null {
    if (this.gmailToken && Date.now() - this.gmailToken.at < 55 * 60_000) return this.gmailToken.token;
    this.hasGmailAccess.set(false);
    return null;
  }

  async logout(): Promise<void> {
    try { await this.call('POST', '/logout', {}); } catch { /* cookie expires anyway */ }
    try { await firebaseSignOut(this.firebaseAuth()); } catch { /* not signed in to Firebase */ }
    this.gmailToken = null;
    this.hasGmailAccess.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}
