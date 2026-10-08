export const SAMPLE_EMAILS: { id: string; label: string; raw: string }[] = [
  {
    id: 'sample-phish-it',
    label: 'Password-expiry phish (spoofed IT desk)',
    raw: `Received: from mail.fake-update.com (unknown [185.156.73.12]) by mx.example.org with ESMTP; Fri, 11 Sep 2026 01:00:05 +0000
Authentication-Results: mx.example.org; spf=softfail smtp.mailfrom=admin@fake-update.com; dkim=fail header.d=fake-update.com; dmarc=fail header.from=fake-update.com
From: "IT Support Desk" <admin@fake-update.com>
Reply-To: helpdesk@mail-secure-desk.top
Return-Path: <bounce@mail-secure-desk.top>
Subject: ACTION REQUIRED: Final Notice for Password Expiry
Date: Fri, 11 Sep 2026 01:00:00 +0000

Your mailbox password expires today. Failure to verify your account will lead to termination of your email access.
Click http://fake-update.com/keep-password to keep your current password.`,
  },
  {
    id: 'sample-phish-sbi',
    label: 'SBI KYC phish (brand impersonation)',
    raw: `Received: from smtp.bulletproof-host.example (unknown [45.133.192.88]) by mx.example.org with ESMTP; Wed, 07 Oct 2026 04:12:10 +0000
Authentication-Results: mx.example.org; spf=fail smtp.mailfrom=alerts@sbi-kyc-verify.xyz; dkim=none; dmarc=fail header.from=sbi-kyc-verify.xyz
From: "SBI Customer Support" <alerts@sbi-kyc-verify.xyz>
Subject: URGENT: Your SBI YONO account will be terminated within 24 hours
Date: Wed, 07 Oct 2026 04:12:00 +0000

Dear customer, your KYC has expired. Immediately update your PAN and Aadhaar at http://sbi-kyc-verify.xyz/update-pan or all debit transactions will be frozen. Share the OTP you receive to confirm.`,
  },
  {
    id: 'sample-legit-google',
    label: 'Genuine Google security notice',
    raw: `Received: from mail-sor-f41.google.com (mail-sor-f41.google.com [209.85.220.41]) by mx.example.org with SMTPS; Mon, 05 Oct 2026 10:00:03 +0000
Authentication-Results: mx.example.org; spf=pass smtp.mailfrom=accounts.google.com; dkim=pass header.d=accounts.google.com; dmarc=pass header.from=google.com
From: Google <no-reply@accounts.google.com>
Return-Path: <3abc@accounts.google.com>
Subject: Security alert for your linked Google Account
Date: Mon, 05 Oct 2026 10:00:00 +0000

A new sign-in was detected on a Linux device. If this was you, you do not need to take any action. Otherwise review activity at https://myaccount.google.com/notifications`,
  },
];
