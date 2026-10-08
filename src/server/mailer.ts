/**
 * Transactional e-mail through Resend (https://resend.com).
 *   RESEND_API_KEY   re_...
 *   RESEND_FROM      "CyberAid <no-reply@yourdomain.com>"  (must be a domain verified in Resend; the default
 *                    onboarding@resend.dev can only deliver to the e-mail address that owns the Resend account)
 *   OTP_DEV_ECHO=true  development only: also return the code in the API response
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class MailError extends Error { constructor(msg: string, public status = 502) { super(msg); } }

export interface SendResult { delivered: boolean; devCode?: string }

export async function sendOtpEmail(to: string, code: string, purpose: 'verify_email' | 'reset_password', name: string, ttlMinutes: number): Promise<SendResult> {
  const reset = purpose === 'reset_password';
  const subject = `${code} is your CyberAid ${reset ? 'password reset' : 'verification'} code`;
  const intro = reset ? 'Use this code to reset your CyberAid password.' : 'Use this code to verify your e-mail and finish creating your CyberAid account.';
  const text = `Hi ${name},\n\n${intro}\n\nYour code: ${code}\n\nIt expires in ${ttlMinutes} minutes. CyberAid will never ask you for this code on a call or message. If you did not request it, ignore this e-mail.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
<h2 style="margin:0 0 8px;color:#0f172a">CyberAid</h2><p style="color:#334155">Hi ${esc(name)},</p><p style="color:#334155">${esc(intro)}</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;background:#f1f5f9;padding:16px;border-radius:8px;color:#0f172a">${esc(code)}</p>
<p style="color:#64748b;font-size:13px">Expires in ${ttlMinutes} minutes. CyberAid will never ask you for this code on a call or message. If you did not request it, ignore this e-mail.</p></div>`;

  const key = process.env['RESEND_API_KEY'];
  if (!key) {
    if (process.env['NODE_ENV'] === 'production' && process.env['OTP_DEV_ECHO'] !== 'true') throw new MailError('E-mail service is not configured (RESEND_API_KEY missing).', 503);
    console.log(`[mailer] RESEND_API_KEY not set: OTP for ${to} (${purpose}) is ${code}`);
    return { delivered: false, devCode: process.env['OTP_DEV_ECHO'] === 'true' ? code : undefined };
  }
  let res: Response;
  try {
    res = await fetch(`${(process.env['RESEND_BASE_URL'] || 'https://api.resend.com').replace(/\/$/, '')}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env['RESEND_FROM'] || 'CyberAid <onboarding@resend.dev>', to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new MailError('Could not reach the e-mail service. Try again shortly.'); }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    console.warn('[mailer] Resend error', res.status, body?.message);
    throw new MailError(res.status === 403 || res.status === 422 ? `E-mail could not be sent: ${body?.message ?? 'sender/recipient not allowed (verify your domain in Resend)'}` : 'E-mail service error. Try again shortly.');
  }
  return { delivered: true };
}
