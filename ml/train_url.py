"""
Train the CyberAid URL phishing classifier.
Model : char 3-5-gram TF-IDF  +  13 standardised lexical features  ->  L2 Logistic Regression
Data  : PhishTank (verified) + Phishing.Database (phishing)  vs  benign crawl URLs + Tranco/Alexa-style top-1M domains
Output: ../src/server/ml/models/url-model.json  and  ../src/server/ml/models/top-domains.json
"""
import json, os, random, re, time
import numpy as np, pandas as pd, scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from url_features import normalize, numeric, split_host_path, registered_domain, FEATURE_NAMES

HERE = os.path.dirname(__file__); D = f"{HERE}/data"
OUT = f"{HERE}/../src/server/ml/models"; os.makedirs(OUT, exist_ok=True)
random.seed(42); np.random.seed(42)

# ---------- load ----------
benign_crawl = [l.strip() for l in open(f"{D}/urls1.csv", errors="ignore") if l.strip()]
top = [l.strip().lower() for l in open(f"{D}/top1m.csv", errors="ignore") if l.strip() and "." in l]
pt = pd.read_csv(f"{D}/urls2.csv").url.dropna().tolist()
pdb = [l.strip() for l in open(f"{D}/phish_urls_now.txt", errors="ignore") if l.strip()]
pdb = [u for u in pdb if re.match(r"^https?://", u)]
print(len(benign_crawl), len(top), len(pt), len(pdb))

PATHS = ["", "", "", "/", "/login", "/signin", "/account", "/index.html", "/about", "/contact", "/products", "/help/support",
         "/en/home", "/login?next=/dashboard", "/user/profile", "/secure/login", "/webapps/login", "/netbanking", "/signin/v2/identifier"]
# benign: modern domains (https world), some with login-ish paths so "login" alone is NOT a phishing signal
top_sample = random.sample(top[:50000], 22000) + random.sample(top[50000:], 22000)
SEG = ["wiki", "gp", "cart", "dp", "product", "products", "item", "watch", "search", "category", "news", "article", "blog", "docs", "en", "in",
       "help", "support", "orders", "profile", "settings", "what-we-do", "personal", "business", "careers", "store", "pages", "view", "details", "offers"]
def rand_path():
    r = random.random()
    if r < .35: return random.choice(PATHS)
    segs = [random.choice(SEG) for _ in range(random.randint(1, 3))]
    if random.random() < .5: segs.append(str(random.randint(100, 99999999)))
    if random.random() < .3: segs.append("".join(random.choice("abcdefghijklmnopqrstuvwxyz-") for _ in range(random.randint(6, 28))))
    p = "/" + "/".join(segs)
    if random.random() < .25: p += "?" + random.choice(["id", "ref", "q", "v", "page"]) + "=" + str(random.randint(1, 99999))
    return p
benign_top = [("https://" if random.random() < .8 else "http://") + ("www." if random.random() < .4 else "") + d + rand_path() for d in top_sample]
phish = random.sample(pdb, 45000) + pt
benign = benign_crawl + benign_top

df = pd.DataFrame({"url": benign + phish, "label": [0] * len(benign) + [1] * len(phish),
                   "src": ["crawl"] * len(benign_crawl) + ["top1m"] * len(benign_top) + ["phishdb"] * 45000 + ["phishtank"] * len(pt)})
df["norm"] = df.url.map(normalize)
df = df[df.norm.str.len() > 3].drop_duplicates("norm").reset_index(drop=True)
df["rd"] = df.norm.map(lambda n: registered_domain(split_host_path(n)[0]))
print(df.groupby(["src", "label"]).size())

# ---------- features ----------
def build(train_df, test_dfs):
    vec = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), max_features=40000, min_df=5, sublinear_tf=True,
                          lowercase=False, dtype=np.float64)
    Xt = vec.fit_transform(train_df.norm)
    sc = StandardScaler().fit(np.array([numeric(n) for n in train_df.norm]))
    def mk(d, X=None):
        X = vec.transform(d.norm) if X is None else X
        return sp.hstack([X, sp.csr_matrix(sc.transform(np.array([numeric(n) for n in d.norm])))]).tocsr()
    return vec, sc, mk(train_df, Xt), [mk(t) for t in test_dfs]

def metrics(y, p):
    yh = (p >= .5).astype(int); tn, fp, fn, tp = confusion_matrix(y, yh).ravel()
    return {"n": int(len(y)), "precision": round(precision_score(y, yh), 4), "recall": round(recall_score(y, yh), 4),
            "f1": round(f1_score(y, yh), 4), "roc_auc": round(roc_auc_score(y, p), 4),
            "false_positive_rate": round(float(fp / (fp + tn)), 4), "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}

# ---------- 1. grouped hold-out (no registered domain appears in both train and test) ----------
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
i_tr, i_te = next(gss.split(df, groups=df.rd))
tr, te = df.iloc[i_tr], df.iloc[i_te]
vec, sc, Xtr, (Xte,) = build(tr, [te])
clf = LogisticRegression(solver="liblinear", C=10, class_weight="balanced", max_iter=2000).fit(Xtr, tr.label)
pte = clf.predict_proba(Xte)[:, 1]
M = {"grouped_holdout": metrics(te.label.values, pte)}
print("holdout", M["grouped_holdout"])
for s in te.src.unique():
    m = te.src.values == s
    yh = (pte[m] >= .5).astype(int)
    M[f"holdout_{s}_accuracy"] = round(float((yh == te.label.values[m]).mean()), 4)
print({k: v for k, v in M.items() if k != "grouped_holdout"})

# ---------- 2. cross-source: train WITHOUT PhishTank, test recall on PhishTank (unseen feed) ----------
tr2 = tr[tr.src != "phishtank"]; te2 = te[te.src == "phishtank"]
vec2, sc2, X2, (Xte2,) = build(tr2, [te2])
clf2 = LogisticRegression(solver="liblinear", C=10, class_weight="balanced", max_iter=2000).fit(X2, tr2.label)
M["cross_source_phishtank_recall"] = round(float((clf2.predict_proba(Xte2)[:, 1] >= .5).mean()), 4)
print("cross-source phishtank recall", M["cross_source_phishtank_recall"])

# ---------- 3. hand-written sanity set (modern / Indian URLs, never in training) ----------
probes = [("https://www.google.com/", 0), ("https://onlinesbi.sbi/", 0), ("https://www.hdfcbank.com/personal/login", 0),
          ("https://cybercrime.gov.in/", 0), ("https://github.com/anthropics", 0), ("https://www.amazon.in/gp/cart", 0),
          ("https://accounts.google.com/signin", 0), ("https://www.irctc.co.in/nget/train-search", 0),
          ("https://en.wikipedia.org/wiki/Cyber_crime", 0), ("https://www.npci.org.in/what-we-do/upi/product-overview", 0),
          ("http://sbi-kyc-update.xyz/verify-account", 1), ("http://hdfc-netbanking-secure.top/login", 1),
          ("https://paytm-kyc-update.click/verify", 1), ("http://192.168.4.5/paypal/login.php", 1),
          ("http://secure-icici-rewards.online/claim", 1), ("https://sbi.co.in.verify-user.cc/login", 1),
          ("http://amazon-india-gift.vip/win", 1), ("https://login-microsoft-office365.web.app/?id=3", 1),
          ("http://paytm.com@evil-pay.xyz/", 1), ("http://fake-update.com/password-expiry", 1)]
pp = clf.predict_proba(sp.hstack([vec.transform([normalize(u) for u, _ in probes]),
      sp.csr_matrix(sc.transform(np.array([numeric(normalize(u)) for u, _ in probes])))]).tocsr())[:, 1]
sanity = [{"url": u, "expected": y, "p_phish": round(float(p), 4)} for (u, y), p in zip(probes, pp)]
for s in sanity: print("OK  " if (s["p_phish"] >= .5) == bool(s["expected"]) else "MISS", s["p_phish"], s["url"])
M["sanity_probes_correct_ml_only"] = f'{sum((s["p_phish"]>=.5)==bool(s["expected"]) for s in sanity)}/{len(sanity)}'

# ---------- 4. refit on everything + export ----------
vecF, scF, XF, _ = build(df, [])
clfF = LogisticRegression(solver="liblinear", C=10, class_weight="balanced", max_iter=2000).fit(XF, df.label)
ngr = [None] * len(vecF.vocabulary_)
for t, i in vecF.vocabulary_.items(): ngr[i] = t
nv = len(ngr)
model = {"type": "char-tfidf-logreg", "version": time.strftime("%Y.%m.%d"), "ngram_range": [3, 5],
         "ngrams": ngr, "idf": [round(float(x), 5) for x in vecF.idf_], "coef": [round(float(x), 5) for x in clfF.coef_[0][:nv]],
         "numeric": {"names": FEATURE_NAMES, "mean": [float(x) for x in scF.mean_], "scale": [float(x) for x in scF.scale_],
                     "coef": [round(float(x), 6) for x in clfF.coef_[0][nv:]]},
         "intercept": float(clfF.intercept_[0]), "thresholds": {"suspicious": 0.4, "high": 0.8},
         "training": {"phishing": int((df.label == 1).sum()), "benign": int((df.label == 0).sum()),
                      "sources": df.groupby("src").size().to_dict(), "n_features": nv + len(FEATURE_NAMES)},
         "metrics": M, "sanity": sanity,
         "note": "Metrics from grouped hold-out (registered domain never in both train and test). Shipped model refit on all data."}
json.dump(model, open(f"{OUT}/url-model.json", "w"), separators=(",", ":"))

# top domains list (lookups + typosquat detection at runtime)
json.dump({"source": "top-1m-domains", "domains": top[:60000]}, open(f"{OUT}/top-domains.json", "w"), separators=(",", ":"))

# parity fixtures
fx = [u for u, _ in probes] + df.sample(80, random_state=3).url.tolist()
Xfx = sp.hstack([vecF.transform([normalize(u) for u in fx]), sp.csr_matrix(scF.transform(np.array([numeric(normalize(u)) for u in fx])))]).tocsr()
json.dump([{"url": u, "p": float(p)} for u, p in zip(fx, clfF.predict_proba(Xfx)[:, 1])], open(f"{HERE}/parity_url.json", "w"))
print("url-model KB", os.path.getsize(f"{OUT}/url-model.json") // 1024)
