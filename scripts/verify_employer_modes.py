"""Audit real generated modes against the sole canonical classification source."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reclassify import blacklist_records, norm

def main():
    source = json.loads((ROOT / "financial_blacklist.json").read_text(encoding="utf-8"))
    types = {norm(r["company"]): r["employerType"] for r in blacklist_records(source, allow_legacy=False)}
    canonical = json.loads((ROOT / "jobs.json").read_text(encoding="utf-8"))["jobs"]
    index = json.loads((ROOT / "jobs-index.json").read_text(encoding="utf-8"))
    assert index.get("employerModeSchema") == 1
    assert len(index["jobs"]) == len(canonical)
    for row, original in zip(index["jobs"], canonical):
        company = original.get("company")
        assert row.get("company") == company
        assert row.get("employerType") == (types.get(norm(company), "unlisted") if isinstance(company, str) else "unlisted")
        assert "evidence" not in row and "review" not in row
    daily = index["postingHistoryDaily"]
    split = index["postingHistoryDailyByMode"]
    for day, values in daily.items():
        for region, total in values.items():
            assert total == sum(split[mode].get(day, {}).get(region, 0) for mode in ("direct", "agency"))
    for mode in ("direct", "agency"):
        for day, values in split[mode].items():
            for region, count in values.items():
                assert 0 < count <= daily[day][region]
    eligible = [row for row in index["jobs"] if row.get("jobStatus") != "expired"
                and row.get("location") in ("CN", "HK", "SG") and row.get("title") and row.get("company")
                and re.match(r"https://(?:[a-z]{2,3}\.)?linkedin\.com/jobs/view/", row.get("link") or "", re.I)]
    counts = Counter(row["employerType"] for row in eligible)
    direct = counts["direct_employer"]
    print(json.dumps({"canonical": len(canonical), "full": len(eligible), "direct": direct,
                      "agency": len(eligible) - direct, "byType": dict(counts),
                      "historyEvents": sum(sum(v.values()) for v in daily.values())}, ensure_ascii=False))
if __name__ == "__main__":
    main()
