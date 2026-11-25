"""Employer names shared by RSS, salary matching and posting history."""
import re
import unicodedata


ALIASES = {
    "hsbc": "hsbc", "thehongkongandshanghaibankingcorporation": "hsbc",
    "standardchartered": "standard chartered", "standardcharteredbank": "standard chartered",
    "渣打环球商业服务有限公司": "standard chartered",
    "citi": "citi", "citibank": "citi", "citigroup": "citi",
    "jpmorganchase": "jpmorgan chase", "jpmorgan": "jpmorgan chase",
    "jpmorganchaseco": "jpmorgan chase", "摩根大通亚洲咨询北京有限公司": "jpmorgan chase",
    "bnpparibas": "bnp paribas", "bnp": "bnp paribas",
    "societegenerale": "societe generale", "sg": "societe generale",
    "dbs": "dbs bank", "dbsbank": "dbs bank",
    "deutschebank": "deutsche bank", "goldmansachs": "goldman sachs",
    "blackrock": "blackrock", "blackrockinc": "blackrock",
    "morganstanley": "morgan stanley", "bbva": "bbva", "natixis": "natixis",
    "natixiscorporateinvestmentbanking": "natixis", "bankofamerica": "bank of america",
    "schroderinvestmentmanagement": "schroders", "schrodersinvestmentmanagement": "schroders",
    "invescoltd": "invesco",
}


def normalize_company(value):
    folded = unicodedata.normalize("NFKD", str(value or "").strip().casefold())
    plain = "".join(ch for ch in folded if not unicodedata.combining(ch))
    company = re.sub(r"\s+", " ", plain)
    compact = re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", company)
    return ALIASES.get(compact, company)
