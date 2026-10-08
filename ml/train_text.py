"""
Train the CyberAid message/email scam classifier.

Model : TF-IDF (word 1-2 grams, sublinear tf) -> L2 Logistic Regression
Data  : SMS Spam Collection (real)  +  Enron e-mail spam corpus (real)  +  India synthetic (augmentation)
Output: ../src/server/ml/models/text-model.json   (pure JSON, runs in Node with no Python)
"""
import json, re, sys, time, os
import numpy as np, pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, GridSearchCV, GroupShuffleSplit
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from india_synth import generate

DATA = os.path.join(os.path.dirname(__file__), "data")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "server", "ml", "models")
os.makedirs(OUT, exist_ok=True)
RNG = 42


def preprocess(t: str) -> str:
    """MUST stay identical to preprocessText() in src/server/ml/text-classifier.ts"""
    t = t.lower()
    t = re.sub(r"https?://\S+|www\.\S+", " urltoken ", t, flags=re.A)
    t = re.sub(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b", " emailtoken ", t, flags=re.A)
    t = re.sub(r"\d{6,}", " bignum ", t, flags=re.A)
    return t


# ---------------- data ----------------
sms = pd.read_csv(f"{DATA}/sms.tsv", sep="\t", header=None, names=["y", "text"])
sms["label"] = (sms.y == "spam").astype(int)
sms = sms[["text", "label"]].assign(source="sms")

en = pd.read_csv(f"{DATA}/enron_spam_data.csv")
en["text"] = (en["Subject"].fillna("") + ". " + en["Message"].fillna("")).str.slice(0, 1200)
en["label"] = (en["Spam/Ham"] == "spam").astype(int)
en = en[en.text.str.len() > 20].drop_duplicates("text")
en = pd.concat([en[en.label == 1].sample(5000, random_state=RNG), en[en.label == 0].sample(5000, random_state=RNG)])
en = en[["text", "label"]].assign(source="enron_email")

syn = pd.DataFrame(generate(30), columns=["text", "label", "tid"])
syn["source"] = "india_synthetic"

# ---------------- splits (stratified for real data, template-grouped for synthetic) ----------------
def strat(df):
    return train_test_split(df, test_size=0.2, stratify=df.label, random_state=RNG)

sms_tr, sms_te = strat(sms)
en_tr, en_te = strat(en)
gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=RNG)
i_tr, i_te = next(gss.split(syn, groups=syn.tid))
syn_tr, syn_te = syn.iloc[i_tr], syn.iloc[i_te]
print("held-out synthetic templates:", sorted(syn_te.tid.unique()))

train = pd.concat([sms_tr, en_tr, syn_tr])
tests = {"sms": sms_te, "enron_email": en_te, "india_synthetic": syn_te}
print("train size", len(train), train.label.mean())

vec = TfidfVectorizer(preprocessor=preprocess, ngram_range=(1, 2), min_df=3, max_features=30000,
                      sublinear_tf=True, dtype=np.float64)
Xtr = vec.fit_transform(train.text)
gs = GridSearchCV(LogisticRegression(solver="liblinear", class_weight="balanced", max_iter=1000),
                  {"C": [1, 3, 10, 30]}, scoring="f1", cv=3, n_jobs=-1)
gs.fit(Xtr, train.label)
clf = gs.best_estimator_
print("best C", gs.best_params_, "cv f1", round(gs.best_score_, 4))

# ---------------- evaluation ----------------
metrics = {}
all_te = pd.concat(tests.values())
def evaluate(df):
    p = clf.predict_proba(vec.transform(df.text))[:, 1]
    yhat = (p >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(df.label, yhat).ravel()
    return {"n": int(len(df)), "precision": round(precision_score(df.label, yhat), 4),
            "recall": round(recall_score(df.label, yhat), 4), "f1": round(f1_score(df.label, yhat), 4),
            "roc_auc": round(roc_auc_score(df.label, p), 4), "false_positive_rate": round(fp / (fp + tn), 4),
            "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}
for k, df in tests.items():
    metrics[k] = evaluate(df); print(k, metrics[k])
metrics["combined"] = evaluate(all_te); print("combined", metrics["combined"])

# real-data-only view (drops synthetic so the headline number is not inflated)
metrics["real_data_only"] = evaluate(pd.concat([sms_te, en_te])); print("real only", metrics["real_data_only"])

# ---------------- hand-written sanity probes (never in training) ----------------
probes = [
    ("Your OTP is 482913. Do not share it with anyone. -HDFC Bank", 0),
    ("Dear customer your SBI KYC is expired, update now at http://sbi-kyc-update.xyz or account will be blocked", 1),
    ("Hi, can we move the meeting to 4pm tomorrow?", 0),
    ("You won a lottery of Rs 25 Lakh, share OTP now to claim", 1),
    ("ACTION REQUIRED: Final Notice for Password Expiry - click http://fake-update.com", 1),
    ("Rs 1,200 debited from A/c XX4521 at Amazon. If not you call the number on the back of your card.", 0),
    ("Your Zomato order is arriving in 10 minutes", 0),
    ("This is CBI. You are under digital arrest. Do not disconnect the video call and transfer money to the safe account", 1),
    ("Earn Rs 5000 daily from home by liking videos, join our Telegram group", 1),
    ("Please find attached the quarterly report for review", 0),
]
pp = clf.predict_proba(vec.transform([p[0] for p in probes]))[:, 1]
sanity = [{"text": t, "expected": y, "p_scam": round(float(p), 4)} for (t, y), p in zip(probes, pp)]
for s in sanity: print(("OK  " if (s["p_scam"] >= .5) == bool(s["expected"]) else "MISS"), s["p_scam"], s["text"][:70])
metrics["sanity_probes_correct"] = f'{sum((s["p_scam"]>=.5)==bool(s["expected"]) for s in sanity)}/{len(sanity)}'

# ---------------- refit on ALL data for the shipped model (hyper-parameters fixed from CV above) ----------------
# Metrics above come from the held-out split; the shipped model sees the held-out rows too.
full = pd.concat([sms, en, syn])
vec = TfidfVectorizer(preprocessor=preprocess, ngram_range=(1, 2), min_df=3, max_features=30000, sublinear_tf=True, dtype=np.float64)
Xf = vec.fit_transform(full.text)
clf = LogisticRegression(solver="liblinear", class_weight="balanced", max_iter=1000, C=gs.best_params_["C"]).fit(Xf, full.label)
pp = clf.predict_proba(vec.transform([p[0] for p in probes]))[:, 1]
sanity = [{"text": t, "expected": y, "p_scam": round(float(p), 4)} for (t, y), p in zip(probes, pp)]
print("--- sanity after refit ---")
for s_ in sanity: print(("OK  " if (s_["p_scam"] >= .5) == bool(s_["expected"]) else "MISS"), s_["p_scam"], s_["text"][:70])
metrics["sanity_probes_correct"] = f'{sum((s_["p_scam"]>=.5)==bool(s_["expected"]) for s_ in sanity)}/{len(sanity)}'
metrics["note"] = "Metrics are from a held-out split (stratified for real data, template-grouped for synthetic). Shipped model is refit on all data with the same hyper-parameters."

# ---------------- export ----------------
terms = [None] * len(vec.vocabulary_)
for t, i in vec.vocabulary_.items(): terms[i] = t
model = {
    "type": "tfidf-logreg", "version": time.strftime("%Y.%m.%d"), "ngram_range": [1, 2],
    "terms": terms, "idf": [round(float(x), 6) for x in vec.idf_], "coef": [round(float(x), 6) for x in clf.coef_[0]],
    "intercept": float(clf.intercept_[0]),
    "thresholds": {"suspicious": 0.35, "high": 0.75},
    "training": {"sources": {"sms_spam_collection": int(len(sms)), "enron_email": int(len(en)), "india_synthetic": int(len(syn))},
                 "C": gs.best_params_["C"], "cv_f1": round(gs.best_score_, 4), "n_features": len(terms)},
    "metrics": metrics, "sanity": sanity,
}
json.dump(model, open(f"{OUT}/text-model.json", "w"), separators=(",", ":"))
# parity fixtures for the TypeScript implementation
fx = [t for t, _ in probes] + list(all_te.sample(60, random_state=1).text.str.slice(0, 600))
fp = clf.predict_proba(vec.transform(fx))[:, 1]
json.dump([{"text": t, "p": float(p)} for t, p in zip(fx, fp)], open(os.path.join(os.path.dirname(__file__), "parity_text.json"), "w"))
print("saved", os.path.getsize(f"{OUT}/text-model.json") // 1024, "KB")
