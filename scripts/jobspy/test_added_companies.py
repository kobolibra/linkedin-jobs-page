#!/usr/bin/env python3
from __future__ import annotations
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "scripts/jobspy/fetch_linkedin_requests.py"
spec = importlib.util.spec_from_file_location("fetch_linkedin_requests", path)
mod = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(mod)

expected = {
    "BNP Paribas": "166278",
    "Societe Generale": "1691",
    "DBS Bank": "163379",
    "Deutsche Bank": "1262",
    "Goldman Sachs": "1382",
    "BlackRock": "4764",
    "Bank of America": "1123",
    "Fidelity International": "1313",
    "Morgan Stanley": "497017",
    "BBVA": "4860",
    "Natixis": "79376776",
    "UBS": "1214",
}
for name, company_id in expected.items():
    assert name in mod.COMPANIES, name
    assert mod.COMPANIES[name]["company_id"].split(",")[0] == company_id
    assert mod.company_match(name, name)
assert mod.company_match("Société Générale", "Societe Generale")
assert mod.company_match("Bank of America", "Bank of America")
assert mod.company_match("BofA Securities", "Bank of America")
assert mod.company_match("Fidelity International", "Fidelity International")
assert mod.company_match("FIL Investment Management", "Fidelity International")

html = """<div class='base-search-card'>
<a class='base-card__full-link' href='https://www.linkedin.com/jobs/view/4460000001/'></a>
<h4 class='base-search-card__subtitle'><a>BNP Paribas</a></h4>
<h3 class='base-search-card__title'>Analyst</h3>
<span class='job-search-card__location'>Beijing, China</span>
<time class='job-search-card__listdate' datetime='2026-09-07T00:00:00Z'></time>
</div>"""
rows = mod.parse_search(html, "BNP Paribas", "2026-09-07T00:00:00+00:00")
assert len(rows) == 1
assert rows[0]["requestedCompany"] == "BNP Paribas"
assert rows[0]["companyCanonical"] == "bnp paribas"
assert rows[0]["sourceJobId"] == "li-4460000001"
print("added_companies_ok", len(expected), "parsed_rows", len(rows))
