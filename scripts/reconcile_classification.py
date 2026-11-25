"""Reconcile observed companies in the checkout before publishing jobs."""
from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reclassify import BEIJING, TARGET, EXCLUDED, plan


def reconcile(root, day):
    def read(path):
        source = root / path
        return source.read_text(encoding="utf-8") if source.is_file() else None

    for ledger in (TARGET, EXCLUDED):
        if not (root / ledger).is_file():
            raise FileNotFoundError(root / ledger)
    files = plan(read, day)
    for path, body in files.items():
        if body != read(path):
            (root / path).write_text(body, encoding="utf-8")


if __name__ == "__main__":
    reconcile(ROOT, datetime.now(BEIJING).date().isoformat())
