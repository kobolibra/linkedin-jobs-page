#!/usr/bin/env python3
"""Audit and repair a completed LinkedIn/JobSpy baseline without overwriting it."""
from __future__ import annotations
import argparse, json, re, unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

TARGETS = {
    "hsbc": "HSBC",
    "standard chartered": "Standard Chartered",
    "citi": "Citi",
    "jpmorganchase": "JPMorgan Chase",
    "jpmorgan chase": "JPMorgan Chase",
    "jpmorgan chase & co.": "JPMorgan Chase",
    "摩根大通亚洲咨询(北京)有限公司": "JPMorgan Chase",
    "bnp": "BNP Paribas",
    "bnp paribas": "BNP Paribas",
    "societe generale": "Societe Generale",
    "société générale": "Societe Generale",
    "sg": "Societe Generale",
    "dbs": "DBS Bank",
    "dbs bank": "DBS Bank",
    "deutsche bank": "Deutsche Bank",
    "goldman sachs": "Goldman Sachs",
    "blackrock": "BlackRock",
    "black rock": "BlackRock",
    "bank of america": "Bank of America",
    "bankofamerica": "Bank of America",
    "bofa": "Bank of America",
    "bofa securities": "Bank of America",
    "fidelity international": "Fidelity International",
    "fil investment management": "Fidelity International",
}

def norm(v: object) -> str:
    raw = unicodedata.normalize("NFKD", str(v or "").strip().casefold())
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", raw)

def canonical_company(v: object) -> str:
    raw = norm(v)
    compact = re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", raw)
    if compact in {"hsbc", "thehongkongandshanghaibankingcorporation"}: return "hsbc"
    if compact in {"standardchartered", "standardcharteredbank", "渣打环球商业服务有限公司"}: return "standard chartered"
    if compact in {"citi", "citibank", "citigroup"}: return "citi"
    if compact in {"jpmorganchase", "jpmorgan", "jpmorganchaseco", "摩根大通亚洲咨询北京有限公司"}: return "jpmorgan chase"
    if compact in {"bnp", "bnpparibas"}: return "bnp paribas"
    if compact in {"societegenerale", "sg"}: return "societe generale"
    if compact in {"dbs", "dbsbank"}: return "dbs bank"
    if compact == "deutschebank": return "deutsche bank"
    if compact == "goldmansachs": return "goldman sachs"
    if compact in {"blackrock", "black rock"}: return "blackrock"
    if compact in {"bankofamerica", "bankofamericacorporation", "bofa", "bofasecurities", "bankofamericamerrilllynch"}: return "bank of america"
    if compact in {"fidelityinternational", "filinvestmentmanagement", "fidelityinvestmentmanagers"}: return "fidelity international"
    return raw

def www_url(value: object) -> str:
    url = str(value or "").strip()
    if not url: return ""
    p = urlsplit(url)
    if p.netloc.casefold() in {"cn.linkedin.com", "hk.linkedin.com", "sg.linkedin.com"}:
        p = p._replace(netloc="www.linkedin.com")
    return urlunsplit(p)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--retry-output", type=Path, required=True)
    ap.add_argument("--report", type=Path, required=True)
    args = ap.parse_args()
    doc = json.loads(args.input.read_text(encoding="utf-8"))
    kept, dropped, retry = [], [], []
    drop_counts = Counter()
    for row in doc.get("jobs", []):
        item = dict(row)
        actual = canonical_company(item.get("company"))
        raw_location = norm(item.get("locationRaw"))
        if any(x in raw_location for x in ("hong kong", "hongkong", "macau", "macao", "澳门")):
            dropped.append(item); drop_counts["non_mainland:" + str(item.get("locationRaw", ""))] += 1; continue
        target = TARGETS.get(actual, {"hsbc":"HSBC","standard chartered":"Standard Chartered","citi":"Citi","jpmorgan chase":"JPMorgan Chase","bnp paribas":"BNP Paribas","societe generale":"Societe Generale","dbs bank":"DBS Bank","deutsche bank":"Deutsche Bank","goldman sachs":"Goldman Sachs","blackrock":"BlackRock","bank of america":"Bank of America","fidelity international":"Fidelity International"}.get(actual))
        if not target:
            dropped.append(item); drop_counts[item.get("company", "")] += 1; continue
        item["requestedCompany"] = target
        item["companyCanonical"] = actual
        item["link"] = www_url(item.get("link"))
        if not (item.get("descriptionText") or "").strip():
            retry.append({"sourceJobId": item.get("sourceJobId"), "link": item.get("link"), "company": target, "title": item.get("title"), "attempts": 0, "lastError": None})
        kept.append(item)
    out = dict(doc)
    out.update({"schemaVersion":"1.2", "repair":"company-filter-and-www-host", "count":len(kept), "jobs":kept})
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    args.retry_output.write_text(json.dumps({"schemaVersion":"1.0", "generatedAt":out.get("generatedAt"), "count":len(retry), "jobs":retry}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    report = {"input":str(args.input),"output":str(args.output),"inputCount":len(doc.get("jobs", [])),"keptCount":len(kept),"droppedCount":len(dropped),"droppedCompanies":drop_counts,"missingDescriptionCount":len(retry),"keptByCompany":Counter(x["requestedCompany"] for x in kept),"retryFile":str(args.retry_output)}
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=dict)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, default=dict))
    return 0
if __name__ == "__main__": raise SystemExit(main())
