import base64
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import reclassify as rc
from scripts.reconcile_classification import reconcile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("daily", ROOT / "auto-daily-companies.py")
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)
DAY = "2026-11-23"
JSON, TARGETS, EXCLUSIONS = rc.daily_paths(DAY)


class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.files = {
            rc.BLACKLIST: '["Breeze"]', rc.INDUSTRIES: '{"Fano":"AI"}',
            rc.TARGET: "公司名\t备注\t首次出现\t最近出现\nBreeze\t待查证\t2026-11-21\t2026-11-22\n",
            rc.EXCLUDED: "公司名\t排除原因\t首次出现\t最近出现\n",
            JSON: json.dumps({"target_companies": [{"company": n, "reason": "待查证"}
                              for n in ("Fano", "Pending", "Bank")], "excluded_companies": []})
        }

    def test_partial_verification_backfill_and_idempotency(self):
        args = dict(additions=["Bank"], industries={"Fano": "Software"}, finalize=True)
        self.files.update(rc.plan(self.files.get, DAY, **args))
        self.assertIn("Pending", self.files[TARGETS])
        self.assertEqual(set(rc.read_ledger(self.files[rc.TARGET], "备注")), {"fano"})
        self.assertIn("Fano\tSoftware", self.files[TARGETS])
        self.assertIn("Fano\tSoftware", self.files[rc.TARGET])
        self.assertIn("Bank", self.files[EXCLUSIONS])
        self.assertEqual(set(rc.read_ledger(self.files[rc.EXCLUDED], "排除原因")), {"bank", "breeze"})
        self.assertEqual(self.files, self.files | rc.plan(self.files.get, DAY, **args))
        earlier = "2026-11-20"
        self.files[rc.daily_paths(earlier)[0]] = self.files[JSON]
        replay = rc.plan(self.files.get, earlier, finalize=True)
        self.assertIn(f"Fano\tSoftware\t{earlier}\t{DAY}", replay[rc.TARGET])

    def test_overlap_and_missing_report_fail_before_any_writes(self):
        with self.assertRaises(FileNotFoundError):
            rc.plan(self.files.get, "2026-11-25", finalize=True, require_daily=True)
        report = json.loads(self.files[JSON])
        report["excluded_companies"] = [{"company": " FANO ", "reason": "conflicting entry"}]
        self.files[JSON] = json.dumps(report)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            rc.plan(self.files.get, DAY, finalize=True)

    def test_reconciliation_propagates_malformed_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "reports").mkdir()
            for path, body in self.files.items():
                (root / path).write_text(body)
            (root / JSON).write_text("{")
            with self.assertRaises(ValueError):
                reconcile(root, DAY)
            self.assertEqual((root / rc.TARGET).read_text(), self.files[rc.TARGET])

    def test_daily_publishes_only_daily_files_and_mirrors_the_commit(self):
        result = {}
        def transact(build, message):
            result.update(build(self.files.get))
            return result
        jobs = [{"company":"New", "pushTime":datetime.now(timezone.utc).isoformat()}]
        with tempfile.TemporaryDirectory() as tmp, patch.object(daily, "OUTPUT_DIR", tmp), \
             patch.object(rc.Repo, "transact", autospec=True, side_effect=lambda repo, *a: transact(*a)):
            daily.push_daily_report_to_github(jobs, DAY)
            self.assertEqual(set(result), set(rc.daily_paths(DAY)))
            self.assertIn("New", result[TARGETS])
            self.assertIn("Fano", result[TARGETS])
            for path, content in result.items():
                self.assertEqual((Path(tmp)/Path(path).name).read_text(encoding="utf-8-sig"), content)
        with patch.object(rc.Repo, "transact", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                daily.push_daily_report_to_github(jobs, DAY)

    def test_git_conflict_recomputes_whole_transaction_from_new_head(self):
        repo = rc.Repo("test", "example/repo", "main", None)
        heads = iter(["a", "b", "b"])
        trees = []
        patches = []
        def api(path, body=None, method=None):
            if path.startswith("/git/ref/"):
                return {"object": {"sha": next(heads)}}
            if path.startswith("/contents/"):
                text = "A" if path.endswith("=a") else "AB"
                return {"encoding":"base64", "content":base64.b64encode(text.encode()).decode()}
            if path.startswith("/git/commits/"):
                return {"tree":{"sha":"base"}}
            if path == "/git/trees":
                trees.append(body["tree"])
                return {"sha":"tree"}
            if path == "/git/commits":
                return {"sha":"commit"}
            self.assertEqual(method, "PATCH")
            patches.append(body)
            if len(patches) == 1:
                raise HTTPError("url", 422, "not a fast-forward", {}, None)
        with patch.object(repo, "api", side_effect=api), patch.object(rc.time, "sleep"):
            repo.transact(lambda read: {p: read(p) + "C" for p in ("one", "two")}, "test")
        self.assertEqual([[e["content"] for e in t] for t in trees], [["AC","AC"], ["ABC","ABC"]])
        self.assertTrue(all(p["force"] is False for p in patches))

    def test_finalize_cli_uses_committed_remote_report_for_local_mirror(self):
        def transact(repo, build, message, dry):
            self.assertFalse(dry)
            return build(self.files.get)
        with tempfile.TemporaryDirectory() as tmp, patch.object(sys, "argv", [
            "reclassify.py", "--date", DAY, "--local-root", tmp, "--finalize"]), \
             patch.object(rc.Repo, "transact", autospec=True, side_effect=transact), \
             patch.object(Path, "read_text", autospec=True, return_value='{"repo":"x/y","branch":"main","github_token":"test"}'):
            rc.main()
            with (Path(tmp)/Path(TARGETS).name).open(encoding="utf-8-sig") as f:
                self.assertIn("Fano\tAI", f.read())
