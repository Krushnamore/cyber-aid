import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './services/auth';
import { LoginPage } from './pages/login/login';
import { VerifyPage } from './pages/verify/verify';
import { GmailScannerPage } from './pages/gmail-scanner/gmail-scanner';
import { AssistantPage } from './pages/assistant/assistant';
import { AnalyticsPage } from './pages/analytics/analytics';
import { CommunityPage } from './pages/community/community';

/** The session is restored asynchronously from the HttpOnly JWT cookie, so guards must wait for it. */
const sessionReady = (auth: AuthService): Promise<void> =>
  auth.authReady()
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const t = setInterval(() => { if (auth.authReady()) { clearInterval(t); resolve(); } }, 20);
      });

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await sessionReady(auth);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

export const rootGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await sessionReady(auth);
  return router.createUrlTree([auth.isLoggedIn() ? '/verify' : '/login']);
};

export const routes: Routes = [
  {
    path: '',
    canActivate: [rootGuard],
    component: LoginPage,
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: LoginPage,
    title: 'Sign In — CyberAid Scam Detection Platform',
  },
  {
    path: 'verify',
    canActivate: [authGuard],
    component: VerifyPage,
    title: 'CyberAid — Forensic Threat Verification Suite',
  },
  {
    path: 'gmail',
    canActivate: [authGuard],
    component: GmailScannerPage,
    title: 'CyberAid — Gmail Phishing & Threat Radar',
  },
  {
    path: 'community',
    canActivate: [authGuard],
    component: CommunityPage,
    title: 'CyberAid — Community & Incident Experience Feed',
  },
  {
    path: 'assistant',
    canActivate: [authGuard],
    component: AssistantPage,
    title: 'CyberAid — AI Incident Assistant & Golden Hour Guide',
  },
  {
    path: 'analytics',
    canActivate: [authGuard],
    component: AnalyticsPage,
    title: 'CyberAid — 5-Year Cybercrime Analytics Dashboard',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
