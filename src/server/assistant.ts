import { complete, llmEnabled, type LlmMessage } from './llm';

export interface ChatTurn { role: 'user' | 'bot'; text: string }

const SYSTEM = `You are CyberAid's incident assistant for victims of online fraud in India.
Rules:
- Be calm, warm and concrete. Reply in the user's language (English/Hindi/Marathi etc.). Max ~170 words.
- Money lost or card/UPI/OTP/PIN shared: first say act within the "Golden Hour" — call the national cyber-crime helpline 1930 immediately, then call the bank to block/freeze, then file at cybercrime.gov.in.
- Sextortion/blackmail: do not pay, keep evidence, block/report on the platform, report on cybercrime.gov.in; reassure it is not their fault. If the user seems in distress, mention Tele-MANAS 14416.
- "Digital arrest": explain no Indian agency arrests or takes money over video calls; hang up; call 1930.
- NEVER ask the user to share OTP, PIN, CVV, passwords or full card numbers. Never promise fund recovery.
- Give numbered steps. Do not invent phone numbers or URLs beyond: 1930, cybercrime.gov.in, 14416, sancharsaathi.gov.in.
- If the question is unrelated to online fraud/safety, politely steer back.`;

const PLAYBOOKS: { id: string; words: string[]; title: string; golden: boolean; steps: string[] }[] = [
  { id: 'upi', words: ['upi', 'pin', 'collect', 'qr', 'gpay', 'google pay', 'phonepe', 'paytm', 'bhim'], title: 'UPI / QR fraud', golden: true,
    steps: ['Call 1930 right now and give the transaction ID, amount and time.', 'Call your bank and ask to block UPI / freeze the debit; note the complaint number.', 'Change your UPI PIN from a trusted device and log out of UPI apps on other devices.', 'Screenshot the chats, QR, number or UPI ID used by the scammer.', 'File a complaint at cybercrime.gov.in and keep the acknowledgement number.'] },
  { id: 'otp', words: ['otp', 'cvv', 'card', 'credit card', 'debit card', 'net banking', 'netbanking', 'password'], title: 'OTP / card details shared', golden: true,
    steps: ['Call your bank\'s official helpline and block the card / net-banking immediately.', 'Call 1930 to report and request a hold on the money trail.', 'Change net-banking and email passwords from another device; sign out everywhere.', 'Check recent transactions and set transaction limits / alerts.', 'Report at cybercrime.gov.in.'] },
  { id: 'debit', words: ['debited', 'debit', 'money', 'lost', 'transferred', 'withdrawn', 'deducted', 'stolen'], title: 'Money debited without consent', golden: true,
    steps: ['Call 1930 immediately — they can alert the receiving bank to freeze funds.', 'Freeze the card/account in your bank app and call the bank\'s official number.', 'Save SMS alerts, transaction references and screenshots.', 'Register on cybercrime.gov.in within 24 hours and send a written dispute to your bank branch.'] },
  { id: 'link', words: ['link', 'click', 'clicked', 'website', 'app', 'apk', 'download', 'installed', 'remote', 'anydesk', 'teamviewer'], title: 'Clicked a link / installed an app', golden: false,
    steps: ['Disconnect from Wi-Fi/mobile data and uninstall the app (especially APK / remote-access apps like AnyDesk).', 'Do not enter any more details on the page.', 'From another device change email, banking and social passwords and enable 2-step verification.', 'Check bank accounts; if money moved, call 1930 now.', 'Run a security scan and, if unsure, factory-reset the phone after backing up photos.'] },
  { id: 'blackmail', words: ['blackmail', 'sextortion', 'nude', 'video call', 'morphed', 'threat', 'extort', 'leak'], title: 'Blackmail / sextortion', golden: false,
    steps: ['Do NOT pay and do not reply further — payment usually leads to more demands.', 'Keep screenshots, usernames, numbers and payment details as evidence; do not delete chats.', 'Block and report the account on the platform; use StopNCII.org if intimate images are involved.', 'Report on cybercrime.gov.in (there is a women/children section) or call 1930.', 'Talk to someone you trust. This is not your fault. If you feel overwhelmed, Tele-MANAS 14416 offers free support.'] },
  { id: 'arrest', words: ['digital arrest', 'cbi', 'police', 'customs', 'narcotics', 'parcel', 'courier', 'ed officer', 'arrest', 'crime branch'], title: 'Digital arrest / fake officer', golden: true,
    steps: ['Disconnect the call. No Indian agency arrests, interrogates or clears funds over video call.', 'Do not transfer money to any "safe account". If you already did, call 1930 immediately.', 'Note the number/ID, take screenshots, and block the caller.', 'Report at cybercrime.gov.in and inform family.'] },
  { id: 'job', words: ['job', 'task', 'telegram', 'invest', 'crypto', 'trading', 'part time', 'part-time', 'lottery', 'prize', 'loan'], title: 'Job / investment / lottery / loan-app scam', golden: true,
    steps: ['Stop paying "fees", "taxes" or "deposits" — genuine employers and lotteries do not ask.', 'Call 1930 with transaction details if you have paid anything.', 'Save the group links, chats, UPI IDs and bank accounts used.', 'For loan apps threatening to message contacts: do not pay again, uninstall, and report at cybercrime.gov.in.'] },
  { id: 'sim', words: ['sim', 'aadhaar', 'aadhar', 'kyc', 'trai', 'pan'], title: 'SIM / KYC / identity misuse', golden: false,
    steps: ['Do not press any key or share Aadhaar/PAN details on the call or link.', 'Check mobile connections linked to your Aadhaar on sancharsaathi.gov.in and report ones you do not recognise.', 'Lock your biometrics on the official UIDAI site/app.', 'Report on cybercrime.gov.in.'] },
];

export function playbookReply(history: ChatTurn[]): string {
  const userText = history.filter((t) => t.role === 'user').map((t) => t.text).join(' ').toLowerCase();
  const scored = PLAYBOOKS.map((p) => ({ p, s: p.words.reduce((n, w) => n + (userText.includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) {
    return `I'm here to help. Please tell me a little more — did you share any OTP, PIN or password, click a link, or lose money? Meanwhile:\n1. Do not respond to the scammer.\n2. Save all evidence (screenshots, numbers, transaction IDs).\n3. If money is involved, call 1930 right away.`;
  }
  const best = scored[0].p;
  const lead = best.golden ? 'Stay calm — acting within the first hour (the Golden Hour) gives the best chance of stopping the transfer.' : 'Take a breath — you can fix this step by step.';
  const steps = best.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const extra = scored.length > 1 ? `\n\nAlso relevant: ${scored.slice(1, 3).map((x) => x.p.title).join(', ')} — tell me if that applies and I'll give those steps too.` : '';
  return `${best.title}\n${lead}\n${steps}${extra}`;
}

export async function chat(history: ChatTurn[]): Promise<{ reply: string; source: 'grok' | 'groq' | 'playbook' }> {
  if (llmEnabled()) {
    try {
      const messages: LlmMessage[] = [
        { role: 'system', content: SYSTEM },
        ...history.slice(-12).map((t): LlmMessage => ({ role: t.role === 'bot' ? 'assistant' : 'user', content: t.text.slice(0, 2000) })),
      ];
      const reply = await complete({ messages, maxTokens: 600, temperature: 0.4 });
      const { llmProvider } = await import('./llm');
      return { reply, source: llmProvider() === 'xai' ? 'grok' : 'groq' };
    } catch (e) {
      console.warn('[assistant] LLM failed, using playbook:', (e as Error).message);
    }
  }
  return { reply: playbookReply(history), source: 'playbook' };
}
