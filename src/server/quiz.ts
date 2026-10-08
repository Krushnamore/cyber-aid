import { randomUUID } from 'node:crypto';
import { complete, llmEnabled, parseJsonLoose } from './llm';

export interface BankQ { id: string; q: string; options: string[]; answer: number; explanation: string; topic: string }

const Q = (topic: string, q: string, options: string[], answer: number, explanation: string): Omit<BankQ, 'id'> => ({ topic, q, options, answer, explanation });

const RAW: Omit<BankQ, 'id'>[] = [
  Q('Reporting', 'Which national helpline should you call immediately after losing money in an online fraud in India?', ['100', '1930', '112', '1800-11-4000'], 1, '1930 is the Cyber Financial Fraud helpline. Calling within the first hour (the "Golden Hour") gives the best chance of freezing the money. Then file at cybercrime.gov.in.'),
  Q('Reporting', 'Where do you file an online cyber-crime complaint in India?', ['cybercrime.gov.in', 'incometax.gov.in', 'mygov.in/cyber', 'uidai.gov.in'], 0, 'The National Cyber Crime Reporting Portal (NCRP) is cybercrime.gov.in.'),
  Q('UPI', 'You are expecting money by UPI and receive a "collect request" asking for your PIN. What should you do?', ['Enter the PIN to receive the money', 'Decline: you never need a PIN to receive money', 'Share the PIN with the sender to speed things up', 'Approve, then ask for a refund'], 1, 'A UPI PIN is only for sending money. A collect request that asks you to authorise is a request for you to PAY.'),
  Q('UPI', 'A stranger says they sent you money by mistake and asks you to scan their QR code to return it. This is…', ['A normal refund method', 'A scam: scanning a QR code never receives money', 'Safe if the amount is small', 'Safe if the QR shows a bank logo'], 1, 'Scanning a QR (or entering your PIN) is how you pay. Genuine refunds arrive in your account without any action from you.'),
  Q('Digital arrest', 'A caller on video claims to be from CBI/Crime Branch, says you are "under digital arrest" and must stay on the call. What is the right response?', ['Cooperate to avoid arrest', 'Transfer money to a "safe RBI account"', 'Disconnect, do not pay anything, and call 1930', 'Ask them to send documents on WhatsApp'], 2, 'No Indian agency arrests people, takes statements or demands money over a video call. "Digital arrest" is always a scam.'),
  Q('OTP', 'Your bank calls and asks for the OTP "to cancel a fraudulent transaction". You should…', ['Share it quickly', 'Never share it: banks never ask for OTP or PIN', 'Share only the last 3 digits', 'Share it if the caller knows your name'], 1, 'An OTP authorises a transaction. Anyone asking for it is trying to take money from your account, whatever they know about you.'),
  Q('KYC', 'An SMS says "Your KYC has expired, click the link to update or your account will be blocked today". What should you do?', ['Click and update quickly', 'Reply STOP', 'Ignore the link; update KYC only in the bank\'s official app or branch', 'Forward it to friends as a warning with the link'], 2, 'KYC scams create urgency and use look-alike links. Use only the official app or visit the branch.'),
  Q('Jobs', 'A "part-time job" offers ₹3,000 a day for liking videos and later asks you to deposit money to "unlock tasks". This is…', ['A normal job with a security deposit', 'A task scam', 'A government scheme', 'A bank offer'], 1, 'Genuine employers do not charge you to work. Early small payouts are bait before larger "deposits".'),
  Q('Parcel', 'A call says a courier parcel in your name has drugs/passports and you must pay a "clearance fee". Best action?', ['Pay to settle quickly', 'Press 1 to speak to an officer', 'Hang up and report; customs do not demand money by phone', 'Share Aadhaar to prove identity'], 2, 'This is a common fake-customs / courier scam used to start a "digital arrest" threat.'),
  Q('SIM', 'How can you check which mobile connections are registered on your Aadhaar?', ['Ask the caller', 'sancharsaathi.gov.in (TAFCOP)', 'A WhatsApp number', 'Any SMS link'], 1, 'The Sanchar Saathi portal lets you see and report connections you do not recognise.'),
  Q('Links', 'Which of these looks most like a genuine State Bank of India site?', ['sbi-kyc-update.xyz', 'onlinesbi.sbi', 'sbi.co.in.verify-user.cc', 'sbi-secure-login.top'], 1, 'Check the registered domain (the part right before the last dot-extension). onlinesbi.sbi is official; the others only contain "sbi" as bait.'),
  Q('Links', 'Does the padlock / HTTPS in the browser prove a website is safe?', ['Yes, always', 'No: it only means the connection is encrypted; scam sites can have it too', 'Yes, if it is green', 'Yes, if the site is a .com'], 1, 'HTTPS protects data in transit. It says nothing about who runs the site.'),
  Q('Links', 'A shortened link (bit.ly/xxxx) arrives in a message from an unknown sender. The best practice is…', ['Open it on a spare phone', 'Expand/preview it first, or avoid it', 'Open it only on Wi-Fi', 'Open it and close quickly'], 1, 'Shorteners hide the real destination. Use a link checker (like CyberAid Verify) before opening.'),
  Q('Investment', 'A WhatsApp group promises "guaranteed 300% returns with SEBI-approved insider tips". What is the red flag?', ['Mentioning SEBI', 'Guaranteed high returns and pressure to deposit quickly', 'Group admins being friendly', 'Using a trading app'], 1, 'No legitimate investment guarantees returns. Investment fraud was the largest source of losses in recent MHA data.'),
  Q('Loan apps', 'An instant-loan app threatens to message your contacts and sends morphed photos if you delay repayment. You should…', ['Pay whatever they ask', 'Stop paying, preserve evidence, uninstall the app and report at cybercrime.gov.in', 'Give them your contacts', 'Take a second loan from them'], 1, 'Illegal loan apps use harassment to extract more money. Report them; do not pay unlawful charges.'),
  Q('Sextortion', 'Someone blackmails you with private images and demands money. What is the best first step?', ['Pay once to end it', 'Do not pay; save evidence, block, and report (1930 / cybercrime.gov.in)', 'Delete all chats immediately', 'Negotiate the amount'], 1, 'Payment usually leads to more demands. Preserve screenshots and report. You are the victim, not at fault. StopNCII.org can help block intimate-image sharing.'),
  Q('Remote access', 'A "customer care agent" asks you to install AnyDesk/TeamViewer to "fix" your payment. You should…', ['Install it to get help quickly', 'Refuse: remote-access apps give them control of your phone', 'Install but not open it', 'Share the code only'], 1, 'Remote-access apps let scammers see OTPs and operate your banking apps.'),
  Q('Passwords', 'Which is the strongest protection for your email and banking logins?', ['A long unique password plus 2-step verification', 'Your birth date', 'The same password everywhere', 'Sharing the password with family'], 0, 'Unique passwords and 2-step verification stop most account takeovers.'),
  Q('Email', 'Which is a typical sign of a phishing email?', ['Sender domain does not match the company, urgent threat, unexpected link/attachment', 'A personalised greeting with your correct name', 'Sent during office hours', 'Contains a company logo'], 0, 'Mismatched domains, urgency and unexpected links are classic signs. Always check the real sender address.'),
  Q('Wi-Fi', 'Is it safe to do net banking on free public Wi-Fi?', ['Yes if the site is HTTPS', 'Avoid it; use mobile data or a trusted network', 'Yes with a VPN from any app store', 'Yes after 10 PM'], 1, 'Public networks can be monitored or spoofed. Use mobile data for banking.'),
  Q('Lottery', 'You are told you won a KBC/lottery prize but must first pay a "processing fee". This is…', ['A normal procedure', 'A lottery scam: real prizes never require advance fees', 'Safe if paid by UPI', 'Safe if they send an ID card photo'], 1, 'Advance-fee lottery scams are old but still common.'),
  Q('Aadhaar', 'What can you do to reduce misuse of your Aadhaar biometrics?', ['Publish it on social media', 'Lock biometrics via the official mAadhaar app / UIDAI site', 'Share the number with every shop', 'Nothing can be done'], 1, 'UIDAI allows you to lock biometrics and use a masked Aadhaar when possible.'),
  Q('After a scam', 'You clicked a suspicious link and entered your password. What should you do first?', ['Wait a few days', 'Change the password from a safe device, enable 2-step verification and check your accounts', 'Reinstall the browser only', 'Ignore it if nothing happened'], 1, 'Act immediately: change credentials, review recent activity, and call 1930 if money moved.'),
  Q('Customer care', 'You search for your bank\'s "customer care number" and call the first result. Why is this risky?', ['It is always safe', 'Scammers publish fake numbers that rank in search results', 'Banks have no phone support', 'Calls are recorded'], 1, 'Use the number printed on your card or on the official website/app.'),
  Q('Marketplace', 'On OLX, a "buyer" claims to be an army officer and sends a QR code to "pay you in advance". This is…', ['Safe because he is in the army', 'A scam: you pay when you scan', 'Safe for amounts under ₹5,000', 'A government scheme'], 1, 'The "army officer" story is a trust trick. Never scan a QR or enter a PIN to receive money.'),
  Q('Deepfake', 'You get a voice note from a "relative" asking for urgent money, but the voice sounds slightly off. What is wise?', ['Send money immediately', 'Call them back on their known number to verify', 'Reply with your UPI PIN', 'Forward to family'], 1, 'Voice cloning is increasingly used in fraud. Verify via a known channel before paying.'),
  Q('APK', 'A message says "Install this APK to claim PM-Kisan / RTO challan details". The safest approach is…', ['Install it; it is official', 'Install apps only from official stores and verify the sender; never sideload from messages', 'Install it and disable antivirus', 'Install it on a tablet'], 1, 'Malicious APKs steal OTP SMS and banking data. Do not install apps sent through messages.'),
  Q('Bills', 'An SMS says "your electricity will be disconnected tonight unless you call this number". Best action?', ['Call immediately', 'Check your bill on the official app/website; ignore urgent threats from unknown numbers', 'Pay to the number given', 'Forward the SMS to neighbours'], 1, 'Utilities do not disconnect same-day through personal mobile numbers. This is a common scam.'),
  Q('UPI', 'Which statement about UPI PIN is correct?', ['Needed to receive money', 'Needed only to send money or authorise a payment', 'Should be shared with customer care', 'Printed on the card'], 1, 'Never enter your PIN for anything you did not initiate as a payment.'),
  Q('Banking domain', 'Which official domain has the Reserve Bank of India directed Indian banks to adopt to make their websites easier to recognise?', ['.xyz', '.bank.in', '.online', '.shop'], 1, 'RBI has directed banks to move to the exclusive ".bank.in" domain. Treat look-alikes with suspicion and check the exact domain.'),
];

export const BANK: BankQ[] = RAW.map((q, i) => ({ id: `b${i + 1}`, ...q }));

interface Session { answers: Map<string, number>; expl: Map<string, string>; created: number; source: 'bank' | 'ai' }
const sessions = new Map<string, Session>();

const shuffle = <T>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export interface PublicQ { id: string; q: string; options: string[]; topic: string }

function register(qs: { id: string; q: string; options: string[]; answer: number; explanation: string; topic: string }[], source: 'bank' | 'ai') {
  const shuffled = qs.map((q) => {
    const correctText = q.options[q.answer];
    const options = shuffle(q.options);
    return { ...q, options, answer: options.indexOf(correctText) };
  });
  const sessionId = randomUUID();
  sessions.set(sessionId, { answers: new Map(shuffled.map((q) => [q.id, q.answer])), expl: new Map(shuffled.map((q) => [q.id, q.explanation])), created: Date.now(), source });
  for (const [k, v] of sessions) if (Date.now() - v.created > 30 * 60_000) sessions.delete(k);
  return { sessionId, source, questions: shuffled.map(({ id, q, options, topic }): PublicQ => ({ id, q, options, topic })) };
}

export async function startQuiz(count: number, useAi: boolean) {
  const n = Math.min(Math.max(count, 3), 10);
  if (useAi && llmEnabled()) {
    try {
      const text = await complete({
        json: true, maxTokens: 1800, temperature: 0.7,
        messages: [
          { role: 'system', content: 'You write multiple-choice awareness quizzes about online fraud for Indian citizens (UPI, QR, OTP, KYC, digital arrest, phishing, loan apps, investment scams, sextortion). Facts must be accurate and consistent with Indian guidance: helpline 1930, cybercrime.gov.in. Respond with JSON only.' },
          { role: 'user', content: `Create ${n} NEW questions, each with exactly 4 options and ONE correct option. JSON: {"questions":[{"q":"...","options":["a","b","c","d"],"answer":<0-3 index of correct option>,"explanation":"<1-2 sentences>","topic":"<2 words>"}]}` },
        ],
      });
      const j = parseJsonLoose<{ questions?: { q: string; options: string[]; answer: number; explanation: string; topic?: string }[] }>(text);
      const ok = (j.questions ?? []).filter((x) => x && typeof x.q === 'string' && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o) => typeof o === 'string') && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < 4 && typeof x.explanation === 'string' && new Set(x.options).size === 4);
      if (ok.length >= 3) return register(ok.slice(0, n).map((x, i) => ({ id: `a${i + 1}`, q: x.q.slice(0, 300), options: x.options.map((o) => o.slice(0, 160)), answer: x.answer, explanation: x.explanation.slice(0, 400), topic: (x.topic || 'Awareness').slice(0, 30) })), 'ai');
    } catch (e) { console.warn('[quiz] AI generation failed, using bank:', (e as Error).message); }
  }
  return register(shuffle(BANK).slice(0, n), 'bank');
}

export function gradeQuiz(sessionId: string, given: Record<string, number>) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  sessions.delete(sessionId); // one submission per session
  const results = [...s.answers.entries()].map(([id, correctIndex]) => ({ id, correctIndex, chosen: Number.isInteger(given[id]) ? given[id] : -1, correct: given[id] === correctIndex, explanation: s.expl.get(id) ?? '' }));
  return { score: results.filter((r) => r.correct).length, total: results.length, results, source: s.source };
}
