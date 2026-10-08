"""
Synthetic India-specific message generator.

WHY: public corpora (SMS Spam Collection = UK 2000s, Enron = US 1999-2002) contain none of the
scams seen in India today (KYC freeze, UPI collect, digital arrest, DISCOM disconnection ...).
These templates are written by hand from publicly documented scam patterns (I4C / RBI / NPCI
advisories) and are used ONLY as training augmentation. Metrics for this source are reported
separately and are measured on templates the model never saw (group split by template).
"""
import random

BANKS = ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "PNB", "Bank of Baroda", "Kotak", "Canara Bank", "Union Bank", "IDFC First"]
WALLETS = ["Paytm", "PhonePe", "Google Pay", "BHIM", "Amazon Pay"]
NAMES = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Rohan", "Kavita", "Suresh", "Meera", "Aditya", "Pooja"]
BAD_TLDS = [".xyz", ".top", ".click", ".online", ".site", ".icu", ".live", ".vip", ".cc", ".buzz"]
SHORT = ["bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "t.co", "is.gd"]
GOOD_DOMAINS = {"SBI": "onlinesbi.sbi", "HDFC Bank": "hdfcbank.com", "ICICI Bank": "icicibank.com",
                "Axis Bank": "axisbank.com", "PNB": "pnbindia.in", "Bank of Baroda": "bankofbaroda.in",
                "Kotak": "kotak.com", "Canara Bank": "canarabank.com", "Union Bank": "unionbankofindia.co.in",
                "IDFC First": "idfcfirstbank.com"}


def _amt(r):
    return r.choice(["Rs 4,820", "Rs.2,499", "INR 15,000", "Rs 45,000", "Rs 9,999", "Rs 1,25,000", "Rs 780", "Rs 25 Lakh", "Rs 5,00,000"])


def _fake_url(r, brand):
    slug = brand.lower().replace(" bank", "").replace(" ", "")
    pat = r.choice(["{s}-kyc-update{t}", "{s}-verify{t}", "{s}secure-login{t}", "update-{s}{t}", "{s}-rewards{t}", "{s}-netbanking{t}"])
    host = pat.format(s=slug, t=r.choice(BAD_TLDS))
    return r.choice(["http://", "https://"]) + host + r.choice(["/verify", "/update", "/login", "/kyc", ""])


def _short_url(r):
    return "https://" + r.choice(SHORT) + "/" + "".join(r.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(6))


# ---- scam bodies: (template_id, text)  -------------------------------------------------------
def scam_bodies(r):
    b, w, n, a = r.choice(BANKS), r.choice(WALLETS), r.choice(NAMES), _amt(r)
    u, s = _fake_url(r, b), _short_url(r)
    return [
        ("kyc1", f"Dear customer, your {b} account KYC has expired. Update PAN and Aadhaar immediately at {u} or your account will be blocked within 24 hours."),
        ("kyc2", f"{b} ALERT: Your account is suspended due to incomplete KYC. Click {s} to verify now. Do not ignore."),
        ("kyc3", f"Your {b} net banking will be deactivated today. Complete KYC verification here {u} and enter your OTP and card PIN."),
        ("upi1", f"You have received a collect request of {a} from {n} on {w}. Enter your UPI PIN to receive the money."),
        ("upi2", f"Sir I sent {a} to your {w} by mistake. Please scan this QR code and approve to return the amount urgently."),
        ("upi3", f"Congratulations! Cashback of {a} credited. Enter UPI PIN to claim your reward now on {s}."),
        ("arrest1", "This is Mumbai Crime Branch. A parcel in your name contains illegal items. You are under digital arrest. Stay on video call and do not disconnect or tell anyone."),
        ("arrest2", "CBI officer here. Your Aadhaar is linked to a money laundering case. Transfer funds to the RBI safe account for verification or you will be arrested today."),
        ("arrest3", "Customs department: your courier parcel is held with passports and drugs. Pay clearance fee immediately to avoid police arrest. Call officer now."),
        ("power1", f"Dear consumer your electricity bill of {a} is pending. Power will be disconnected tonight at 9:30 PM. Call officer {n} immediately at 98{r.randint(10000000,99999999)}."),
        ("power2", f"MSEDCL: last notice, bill unpaid. Connection will be cut today. Pay now via {s} to avoid disconnection."),
        ("job1", f"Part time job offer! Earn {a} daily by liking YouTube videos. Join our Telegram group now, no experience required, registration fee refundable."),
        ("job2", f"Work from home task: complete simple tasks and earn commission {a} per day. WhatsApp {n} to start. Limited slots, hurry."),
        ("lot1", f"Congratulations! You have won the KBC lottery of {a}. To claim your prize share your bank details and pay processing fee."),
        ("lot2", f"Your mobile number won a lucky draw prize {a}. Send OTP to confirm your winning now."),
        ("loan1", f"Instant loan approved {a} without documents! Click {s} to download app. Pay processing fee first. Repayment threats if delayed, we will message your contacts."),
        ("tax1", f"Income Tax Department: you are eligible for a refund of {a}. Verify your bank account at {u} within 12 hours to receive the refund."),
        ("sim1", "TRAI notice: your SIM card will be blocked in 2 hours due to illegal activity. Press 9 to speak to an executive and verify your Aadhaar."),
        ("inv1", f"Guaranteed 300% returns on stock tips. Join our VIP trading WhatsApp group, deposit {a} and double your money in 7 days, SEBI approved insider calls."),
        ("inv2", f"Crypto investment opportunity: invest {a} today and withdraw profit tomorrow. Limited offer, ask {n} for the secret platform link {s}."),
        ("sext1", f"I have your private video. Pay {a} in the next hour or I will send it to all your contacts and family. Do not tell anyone."),
        ("card1", f"Your {b} credit card reward points worth {a} will expire today. Redeem now at {u}. Share the OTP received to confirm."),
        ("card2", f"Unauthorized transaction of {a} on your {b} card. If not you, call this number now and share the OTP and CVV to block the card."),
        ("gift1", f"Free gift voucher from Amazon worth {a}! Claim before midnight {s}. Enter your card details to pay shipping only."),
        ("bec1", f"Urgent: I'm in a meeting and can't talk. Need you to buy gift cards worth {a} for a client right now and send me the codes. Keep this confidential, {n}."),
        ("it1", "ACTION REQUIRED: Final notice for password expiry. Your mailbox will be terminated today. Click the link below to keep the same password and verify your account."),
        ("it2", "IT Support Desk: Your email storage is full and your account will be deactivated. Sign in now to verify and avoid suspension of services."),
    ]


# ---- benign bodies ---------------------------------------------------------------------------
def benign_bodies(r):
    b, n, a = r.choice(BANKS), r.choice(NAMES), _amt(r)
    otp = r.randint(100000, 999999)
    gd = GOOD_DOMAINS[b]
    return [
        ("otp1", f"{otp} is your OTP for login to {b}. Valid for 10 minutes. Do not share this OTP with anyone. {b} never asks for your OTP."),
        ("otp2", f"Your one time password for the transaction of {a} is {otp}. Never share it with anyone including bank staff."),
        ("tx1", f"Your A/c XX{r.randint(1000,9999)} is debited by {a} on {r.randint(1,28)}-Oct-26 at Swiggy. Avl bal Rs {r.randint(1000,90000)}. If not you, call the number on the back of your card. -{b}"),
        ("tx2", f"Rs {r.randint(100,50000)} credited to your account XX{r.randint(1000,9999)} via UPI from {n}. Ref no {r.randint(10**11,10**12-1)}. -{b}"),
        ("tx3", f"Your {b} statement for September is ready. Log in to the official app or visit {gd} to download it."),
        ("del1", f"Your Amazon order has been shipped and will arrive by Thursday. Track your package in the Amazon app. Order #{r.randint(100,999)}-{r.randint(1000000,9999999)}."),
        ("del2", f"Zomato: Your order is on the way and will reach you in 15 minutes. Delivery partner {n} is nearby."),
        ("rem1", f"Reminder: your appointment with Dr. {n} is on Friday at 4:30 PM at the clinic. Reply CONFIRM to confirm or call us to reschedule."),
        ("rem2", f"Hi {n}, your electricity bill of {a} is due on the 15th. You can pay through the official Mahavitaran app or your registered auto-debit. Thank you."),
        ("rech1", f"Recharge successful! Rs 299 plan activated with 1.5GB per day for 28 days. Thank you for choosing us. Check balance on the app."),
        ("chat1", f"Hey {n}, are we still meeting for lunch tomorrow? Let me know the time and I will book the table."),
        ("chat2", f"Can you please send me the slides before the meeting at 3 pm? Thanks, {n}."),
        ("work1", f"Hi team, please find attached the minutes of the project review meeting. Action items are listed below with owners and deadlines. Regards, {n}."),
        ("work2", f"Your leave request for next Monday has been approved by your manager. Please update the shared team calendar accordingly."),
        ("work3", f"Invoice #{r.randint(1000,9999)} for the quarterly subscription is attached. Payment is due in 30 days via the bank details on file. Contact accounts for any queries."),
        ("edu1", f"Dear student, the semester exam timetable has been published on the college website. Hall tickets will be available from Monday. - Exam Cell"),
        ("sec1", f"Security alert: a new sign in to your Google Account was detected on a Linux device. If this was you, no action is needed. Otherwise review activity at accounts.google.com."),
        ("sec2", f"{b} reminder: we will never call or message you asking for your PIN, password or OTP. Report suspicious messages to 1930 or cybercrime.gov.in."),
        ("travel1", f"Your IRCTC ticket PNR {r.randint(10**9,10**10-1)} is confirmed. Train departs at 06:15 from Nagpur. Wishing you a pleasant journey."),
        ("fam1", f"Happy birthday {n}! Wishing you a wonderful year ahead. Dinner at our place on Sunday, do come with the family."),
        ("otp3", f"Use {otp} as your one time password to log in to {b} Mobile Banking. This OTP is valid for 5 min. Do not disclose it to anyone."),
        ("otp4", f"OTP for payment of {a} to Flipkart is {otp}. Do not share this code with anybody, our staff will never ask for it. -{b}"),
        ("otp5", f"{otp} is the verification code for your Google Pay registration. Do not share this code. Valid for 10 mins."),
        ("otp6", f"Dear {n}, {otp} is your OTP for Aadhaar authentication. It is valid for 10 minutes. Please do not share it with anyone. UIDAI"),
        ("tx4", f"Paid {a} to Reliance Fresh via UPI. UPI Ref {r.randint(10**11,10**12-1)}. Not you? Call your bank helpline. -{b}"),
        ("tx5", f"Dear customer, your {b} credit card ending {r.randint(1000,9999)} was used for {a} at Big Bazaar. Report unauthorized use through the official app."),
        ("tx6", f"Your EMI of {a} has been debited successfully on {r.randint(1,28)}-Oct-26. Thank you for banking with {b}."),
        ("del3", f"Your Flipkart package will be delivered today by {n}. Share the delivery code {r.randint(1000,9999)} only with the delivery executive at your door."),
        ("del4", f"Swiggy: your order #{r.randint(10000,99999)} has been delivered. Rate your experience in the app. Enjoy your meal!"),
        ("gov1", f"DigiLocker: your driving licence has been successfully added to your account. Access it from the official app or digilocker.gov.in."),
        ("gov2", f"Dear taxpayer, your income tax return for AY 2025-26 has been processed. You can view the intimation by logging in at the official e-filing portal."),
        ("tel1", f"Dear customer your postpaid bill of {a} for September is generated. Pay by 20th Oct through the MyJio or Airtel Thanks app to avoid late fees."),
        ("edu2", f"Your online class link for tomorrow 10 AM has been shared on the college portal. Please log in with your student ID. -Principal"),
        ("mail1", f"Hi {n}, thanks for registering for the webinar. The session starts on Saturday at 11 AM. A calendar invite is attached for your convenience."),
        ("mail2", f"Welcome to our service! Your account has been created successfully. Click the button in the app to set your preferences whenever you are ready."),
    ]


OPENERS_S = ["", "", "URGENT: ", "Alert! ", "Final reminder: ", "Important: ", "Notice: "]
CLOSERS_S = ["", "", " Act now.", " Do it immediately.", " Reply fast.", " Keep this confidential."]
OPENERS_B = ["", "", "FYI: ", "Hi, ", "Hello, "]
CLOSERS_B = ["", "", " Thanks.", " Regards.", " Have a nice day."]


def generate(n_per_template=40, seed=7):
    """returns list of (text, label, template_id)  label 1 = scam / phishing"""
    r = random.Random(seed)
    rows = []
    for _ in range(n_per_template):
        for tid, txt in scam_bodies(r):
            rows.append((r.choice(OPENERS_S) + txt + r.choice(CLOSERS_S), 1, tid))
        for tid, txt in benign_bodies(r):
            rows.append((r.choice(OPENERS_B) + txt + r.choice(CLOSERS_B), 0, tid))
    return rows


if __name__ == "__main__":
    rows = generate(2)
    print(len(rows)); [print(x) for x in rows[:4]]
