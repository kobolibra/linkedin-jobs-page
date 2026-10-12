"""Exercise publication and the clean-build gate against a local Git remote."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendPayloadSyncTests(unittest.TestCase):
    def test_publish_repairs_drift_and_clean_build_gate_catches_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote, checkout = root / "remote.git", root / "checkout"
            subprocess.run(("git", "init", "--bare", str(remote)), check=True, capture_output=True)
            subprocess.run(("git", "clone", str(remote), str(checkout)), check=True, capture_output=True)
            for name in ("sync_frontend_payloads.py", "build_jd_shards.mjs"):
                target = checkout / "scripts" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / "scripts" / name, target)
            for name in ("build_frontend_payload.py", "jev_preprocess.py", "linkedin_ids.py", "logo_sources.py"):
                target = checkout / "scripts" / "jobspy" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / "scripts" / "jobspy" / name, target)
            (checkout / "jobs.json").write_text(json.dumps({"jobs": [{"title": "Engineer", "company": "Acme", "link": "https://www.linkedin.com/jobs/view/12345678", "descriptionText": "Build and operate reliable data pipelines for business applications."}]}), encoding="utf-8")
            (checkout / "company-logos.json").write_text(json.dumps({"acme": "assets/company-logos/" + "a" * 24 + ".svg"}), encoding="utf-8")
            state = checkout / "data" / "company-logos" / "state.json"
            state.parent.mkdir(parents=True, exist_ok=True)
            state.write_text(json.dumps({"acme": {"status": "ready", "imageKind": "placeholder"}}), encoding="utf-8")
            for name in ("jobs-index.json", "jobs-details.json", "data/jev-boilerplate.json"):
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("{}\n", encoding="utf-8")
            subprocess.run(("git", "-C", str(checkout), "add", "."), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "seed"), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "branch", "-M", "main"), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "push", "-u", "origin", "main"), check=True, capture_output=True)
            command = (sys.executable, "scripts/sync_frontend_payloads.py")
            subprocess.run((*command, "--publish"), cwd=checkout, check=True, capture_output=True)
            index = json.loads((checkout / "jobs-index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(index["jobs"]), 1)
            self.assertEqual(len(index["companyLogos"]), 1)
            self.assertEqual(index["companyLogoFallback"], index["companyLogos"]["acme"])
            subprocess.run(command, cwd=checkout, check=True, capture_output=True)
            jobs = checkout / "jobs.json"
            jobs.write_text(jobs.read_text(encoding="utf-8").replace("Engineer", "Analyst"), encoding="utf-8")
            self.assertNotEqual(subprocess.run(command, cwd=checkout, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
