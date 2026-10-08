# Presentation vs. project: requirements check

Deck: "CyberAid: Scam Detection and Incident Guidance Platform" (PRPCEM, 2026-27).

| Deck claim (slide) | Status | Evidence / what to do |
|---|---|---|
| Check phone, SMS, e-mail, URL, QR, UPI before acting (6) | MET | Verify page: link, UPI ID, phone, SMS/text, QR image (decoded in browser), e-mail (paste or Gmail). Output Safe / Suspicious / High-risk |
| Output → Block / Verify / Report / Get guidance (6) | MET | Block (per-user blocklist), Report (community reports change future verdicts), NCRP link, Assistant link |
| AI/ML + NLP + computer vision (3) | MET | TF-IDF + logistic regression for text, char n-gram model for URLs, QR decoding (jsQR). Held-out F1 0.968 / 0.970 |
| Interactive five-year analytics dashboard (6) | MET | 2021-2025, official cited figures; year filter, line chart, donut, state table |
| Community: blogs, forums, testimonials, quizzes (6) | MET (quiz was missing) | Posts/comments/likes persisted per user; quiz + leaderboard added |
| AI incident assistant, "golden hour" steps (6) | MET | Grok/Groq via GROK_API_KEY, offline playbooks as fallback |
| Frontend React.js (MERN) (5) | NOT MET | Project is Angular 21 (SSR). Change the slide (recommended): "Angular + Node/Express + MySQL" |
| Backend Node.js + Express REST APIs (5) | MET | /api/* routes |
| JWT login + Resend e-mail/OTP (5) | MET | Own JWT (HttpOnly cookie), e-mail OTP via Resend for sign-up verification and password reset |
| MongoDB + MySQL hybrid database (5) | PARTLY | MySQL only (10 tables). There is no MongoDB: change the slide to "MySQL" |
| Trained model APIs: phishing, QR, NLP (5) | MET | /api/scan, /api/scan/email, /api/ml/models |
| CI/CD, Render (API) + Vercel (Web) (5) | PARTLY | GitHub Actions CI (with MySQL service) + render.yaml. One Render service hosts UI and API; Vercel is not used |
| Limitations: voice/deepfake not covered; accuracy depends on data (7, 9) | CONSISTENT | Measured false-alarm rates 1.6% (text) / 3.1% (URL) can be quoted |
| Future scope: multi-language NLP, NCRP API, mobile app (9) | CONSISTENT | Not implemented, correctly listed as future |

## Missing from the deck itself (typical mini-project requirements)
1. Problem statement / objectives slide.
2. System architecture diagram and data-flow (input → model → verdict → action).
3. Results / evaluation slide: datasets, F1/precision/recall/false-alarm rate, example outputs (numbers are in README.md and in-app "How accurate are the models?").
4. Conclusion slide.
5. Literature survey claims [2][3] have no citations, and the 4 references are generic awareness papers. Add the datasets and official sources actually used: SMS Spam Collection (Almeida et al., 2011), Enron e-mail corpus, PhishTank, Phishing.Database, MHA/NCRB replies.
6. Slide 3 "Cybercrime Growth" has no figure. Suggested official ones: NCRP complaints 4.52 lakh (2021) → 22.68 lakh (2024) → 28.15 lakh (2025).
