#!/usr/bin/env python3
"""Minify the browser payload without deleting lifecycle/audit metadata."""
import json
from pathlib import Path

path = Path("jobs.json")
doc = json.loads(path.read_text(encoding="utf-8"))
removed = 0
for job in doc.get("jobs", []):
    # descriptionText duplicates a richer descriptionHtml and can be derived by
    # the browser. All lifecycle, provenance and diagnostic fields are retained.
    if job.get("descriptionHtml") and job.pop("descriptionText", None) is not None:
        removed += 1
path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print("compacted_jobs", len(doc.get("jobs", [])), "removed_duplicate_descriptionText", removed, "bytes", path.stat().st_size)
