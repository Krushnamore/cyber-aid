import { freshDb } from './_db';
const cases: [string, number | null, 'text' | 'phone' | 'qr' | undefined][] = [
  ['https://www.google.com/', 0, undefined], ['https://onlinesbi.sbi/', 0, undefined], ['https://www.hdfcbank.com/personal/login', 0, undefined],
  ['https://cybercrime.gov.in/', 0, undefined], ['https://github.com/anthropics', 0, undefined], ['https://www.amazon.in/gp/cart', 0, undefined],
  ['https://accounts.google.com/signin', 0, undefined], ['https://en.wikipedia.org/wiki/Cyber_crime', 0, undefined], ['https://www.irctc.co.in/nget/train-search', 0, undefined],
  ['http://sbi-kyc-update.xyz/verify-account', 1, undefined], ['http://hdfc-netbanking-secure.top/login', 1, undefined], ['https://paytm-kyc-update.click/verify', 1, undefined],
  ['http://192.168.4.5/paypal/login.php', 1, undefined], ['https://sbi.co.in.verify-user.cc/login', 1, undefined], ['http://paytm.com@evil-pay.xyz/', 1, undefined],
  ['https://login-microsoft-office365.web.app/?id=3', 1, undefined], ['http://amaz0n-india.com/login', 1, undefined], ['http://paytrn.com/pay', 1, undefined],
  ['refund@ybl-help', 1, undefined], ['rahul.sharma@oksbi', 0, undefined], ['lottery.winner@paytm', 1, undefined],
  ['+92 300 1234567', 1, 'phone'], ['+91 98765 43210', 0, 'phone'], ['140123456', 1, 'phone'],
  ['upi://pay?pa=shop123@okaxis&pn=Ram%20Stores&am=45000&cu=INR', 1, 'qr'], ['https://bit.ly/3xYz12', null, undefined],
  ['Your OTP is 482913. Do not share it with anyone. -HDFC Bank', 0, 'text'],
  ['Dear customer your SBI KYC is expired, update now at http://sbi-kyc-update.xyz or your account will be blocked', 1, 'text'],
  ['Congratulations you won lottery of Rs 25 Lakh, share OTP now', 1, 'text'], ['Hi, are we still meeting at 4pm tomorrow?', 0, 'text'],
];
(async () => {
await freshDb();
const { analyze } = await import('../src/server/ml/entity-analyzer');
let ok = 0, n = 0;
for (const [i, exp, h] of cases) {
  const r = await analyze(i, h, { userId: null });
  const got = r.verdict === 'safe' ? 0 : 1;
  const mark = exp === null ? '??' : got === exp ? 'OK' : 'MISS';
  if (exp !== null) { n++; if (got === exp) ok++; }
  console.log(mark.padEnd(5), r.kind.padEnd(6), String(r.score).padStart(3), r.verdict.padEnd(10), i.slice(0, 70));
}
console.log(`\nhybrid pipeline: ${ok}/${n} correct`);
process.exit(ok === n ? 0 : 1);
})();
