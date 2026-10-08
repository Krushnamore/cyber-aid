# CyberAid — scam verification & incident help (India)

Angular 21 (SSR) + Express. Everything is dynamic: analysis runs on the server with **trained ML models**, community data is persisted, and nothing in the UI is a hard-coded demo result.

## Run
```bash
docker compose up -d                 # local MySQL 8 (or use any MySQL/MariaDB and set DATABASE_URL)
npm install --legacy-peer-deps
cp .env.example .env                 # set JWT_SECRET (openssl rand -hex 32), RESEND_API_KEY, optional GROK_API_KEY
npm run dev                          # tables are created automatically on first start
npm run test:ml                      # model parity, detection pipeline, auth/OTP/MySQL API, LLM integration
npm run build && npm run start:prod  # production
```
Without `RESEND_API_KEY` in development the OTP is printed in the server console (set `OTP_DEV_ECHO=true` to also return it in the API response). In production a missing key makes sign-up fail with a clear error instead of silently skipping verification.

## Free cloud MySQL
See `.env.example` for Aiven (free MySQL) and TiDB Cloud Starter connection strings. `DATABASE_URL`, `MYSQL_SSL` and `MYSQL_SSL_CA` are read from `.env` automatically.

## Authentication, database and e-mail OTP
* **MySQL** (`mysql2`): users, otp_codes, posts, post_likes, comments, entity_reports, blocklist, scans, quiz_scores, kv. Schema is created idempotently in `src/server/db.ts`.
* **JWT** (HS256, `jose`): issued after e-mail verification or login, sent as an **HttpOnly, SameSite=Lax (Secure in production) cookie**; `Authorization: Bearer` also works for API clients. Cookie-authenticated writes require `X-Requested-With: cyberaid` (CSRF guard). Changing the password bumps `token_version`, which invalidates every older token.
* **Passwords**: scrypt with per-user salt (no plain text anywhere).
* **E-mail OTP** (Resend): 6 digits, 10-minute expiry, stored only as an HMAC, single use, max 5 wrong attempts, 60 s resend cooldown, 5 sends/hour. Used for **sign-up verification** and **forgot-password**. Login and "resend" responses do not reveal whether an e-mail is registered.
* **Google sign-in**: the Firebase popup returns an ID token that the server verifies and exchanges for the same CyberAid JWT (users land in the same MySQL table). Firebase is also used only to obtain the read-only Gmail token for the inbox scanner.

## What is real now
| Feature | How it works |
|---|---|
| **Link check** | Char n-gram TF-IDF + 13 lexical features → logistic regression, **plus** domain reputation (top-60k list, official Indian bank/gov domains), brand-impersonation / typosquat / homoglyph detection, live **RDAP domain-age** lookup, community reports, personal blocklist |
| **Text / SMS check** | TF-IDF word 1-2-gram logistic regression; links, UPI IDs and phone numbers inside the text are analysed too; per-word evidence shown |
| **QR check** | QR decoded in-browser (jsQR) → UPI payment request (`upi://pay`, flags "scan to receive" scams) or URL/text analysis |
| **UPI ID / phone** | Format + handle rules + community reports + your blocklist (no public database can prove a number is safe — the UI says so) |
| **E-mail forensics** | Real header parsing: SPF/DKIM/DMARC from `Authentication-Results`, `Received` relay chain, Return-Path/Reply-To mismatch, display-name spoofing, body + link models, RDAP age, IP geolocation, SHA-256 of the evidence |
| **Gmail scanner** | Gmail API (read-only), headers + body analysed on the server; "sample e-mails" mode is clearly labelled |
| **Community** | MySQL-backed posts, per-user likes, comments, delete-own-post, JWT identity |
| **Assistant** | Grok (xAI) or Groq via one `GROK_API_KEY`; without a key, structured incident playbooks (1930, NCRP, bank steps) |
| **Quiz** | 30 curated India-specific questions + optional AI-written quizzes, server-side grading, leaderboard |
| **Analytics** | 5-year dashboard (2021–2025) built from **official, cited** NCRP / NCRB / MHA figures (`src/server/national-data.ts`). Grok adds only a commentary and state labels, always tagged *AI*; it never supplies numbers |

## The ML models (`ml/`)
Trained offline with scikit-learn, exported to JSON, executed in TypeScript (`src/server/ml/`). `scripts/parity.ts` proves TS output equals scikit-learn (max diff < 2e-6).

Retrain: `bash ml/fetch_data.sh && pip install -r ml/requirements.txt && npm run train`

**Held-out results** (the shipped model is refit on all data with the same hyper-parameters):

| Model | Data | Test F1 | Precision | Recall | False-alarm rate |
|---|---|---|---|---|---|
| Message / e-mail | SMS Spam Collection + Enron e-mail (real; SMS alone F1 0.915, Enron 0.976) | 0.968 | 0.973 | 0.963 | 1.6% |
| Message / e-mail | India synthetic, unseen templates | 0.957 | 0.994 | 0.922 | 0.3% |
| URL | PhishTank + Phishing.Database vs benign crawl + top-1M domains, split by registered domain | 0.970 | 0.964 | 0.977 | 3.1% |
| URL cross-source | trained *without* PhishTank, recall on PhishTank | – | – | 0.93 | – |

### Honest limitations
* Public corpora are old (SMS 2000s UK, Enron 1999-2002). Indian scam wording is covered by **synthetic templates** written from public advisories — reported separately, never mixed into the "real data" number.
* Small genuine websites can look unusual to the URL model; without corroboration they are capped at **suspicious**, not "high".
* Scores are model estimates, not proof. Keep the 1930 / cybercrime.gov.in guidance prominent.
* RDAP and IP-geolocation lookups need outbound internet and degrade gracefully when unavailable.
* Gmail `gmail.readonly` is a restricted scope: publishing to the public requires Google OAuth verification.
* Add your domain to Firebase "Authorized domains" for Google sign-in. Keep `ALLOW_DEMO_AUTH=false` in production.
* Auth rate limits are in-memory per server instance; run one instance, or move them to MySQL/Redis before scaling out.

## Data sources for the dashboard
See the in-app "Sources" panel. Highlights: Lok Sabha USQ 251 (21 Jul 2026) for NCRB state-wise cases 2020-24 and NCRP/CFCFRMS totals 2021-25; Rajya Sabha USQ 1349 (11 Feb 2026); MHA data on 2025 (28.15 lakh cases, ₹22,495 Cr, 55,484 FIRs). Values that are not published are shown as N/A, never estimated.

## CI/CD & deployment
`.github/workflows/ci.yml` starts a MySQL service, runs all tests and the production build on every push. `render.yaml` is a Render Blueprint (one web service for UI + API). Render has no managed MySQL: use a hosted MySQL (set `DATABASE_URL`, `MYSQL_SSL=true`) or the optional private-service block in the file.
