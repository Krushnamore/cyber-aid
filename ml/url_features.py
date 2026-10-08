"""URL normalisation + numeric features. MUST stay identical to src/server/ml/url-classifier.ts"""
import math, re

FEATURE_NAMES = ["len_url", "len_host", "dots_host", "hyphens_host", "digit_ratio_host", "subdomains",
                 "is_ip", "has_at", "len_path", "n_params", "entropy_host", "has_punycode", "digit_ratio_url"]
SLD = {"co", "com", "org", "net", "gov", "ac", "edu", "nic", "res"}


def normalize(u: str) -> str:
    u = re.sub(r"\s+", "", u.strip().lower())
    u = re.sub(r"^[a-z][a-z0-9+.\-]*://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u[:200]
    if u.endswith("/") and u.count("/") == 1:
        u = u[:-1]
    return u


def split_host_path(n: str):
    m = re.match(r"^([^/?#]*)(.*)$", n)
    host, rest = m.group(1), m.group(2)
    if "@" in host:
        host = host.split("@")[-1]
    host = re.sub(r":\d+$", "", host)
    return host, rest


def registered_domain(host: str) -> str:
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    if len(parts[-1]) == 2 and parts[-2] in SLD:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def entropy(s: str) -> float:
    if not s:
        return 0.0
    from collections import Counter
    c = Counter(s); n = len(s)
    return -sum(v / n * math.log2(v / n) for v in c.values())


def numeric(n: str):
    host, rest = split_host_path(n)
    path = re.match(r"^[^?#]*", rest).group(0)
    qm = re.search(r"\?([^#]*)", rest)
    n_params = (qm.group(1).count("&") + 1) if qm and qm.group(1) else 0
    is_ip = 1.0 if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host) else 0.0
    hl, nl = max(len(host), 1), max(len(n), 1)
    return [
        math.log1p(len(n)), math.log1p(len(host)), float(host.count(".")), float(host.count("-")),
        sum(c.isdigit() for c in host) / hl, float(max(0, host.count(".") - 1)), is_ip,
        1.0 if "@" in n.split("/")[0] else 0.0, math.log1p(len(path)), float(n_params),
        entropy(host), 1.0 if "xn--" in host else 0.0, sum(c.isdigit() for c in n) / nl,
    ]
