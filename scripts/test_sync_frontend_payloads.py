"""Exercise publication and the clean-build gate against a local Git remote."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendPayloadSyncTests(unittest.TestCase):
    def test_boilerplate_bytes_are_stable_across_python_hash_seeds(self) -> None:
        code = (
            "import json; from jev_preprocess import build_boilerplate_table; "
            "jobs=[('Acme','<p>We provide flexible working opportunities across the region.</p>"
            "<p>We value collaboration and continuous learning across teams.</p>')]*20; "
            "print(json.dumps(build_boilerplate_table(jobs),ensure_ascii=False,separators=(',',':')))"
        )
        results = []
        for seed in ("1", "2", "3"):
            env = os.environ.copy()
            env["PYTHONHASHSEED"] = seed
            env["PYTHONPATH"] = str(ROOT / "scripts" / "jobspy")
            results.append(subprocess.check_output((sys.executable, "-c", code), env=env))
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[1], results[2])

    def test_publish_repairs_drift_and_clean_build_gate_catches_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote, checkout = root / "remote.git", root / "checkout"
            subprocess.run(("git", "init", "--bare", str(remote)), check=True, capture_output=True)
            subprocess.run(("git", "clone", str(remote), str(checkout)), check=True, capture_output=True)
            # The real asset pack statically imports guest_preview.mjs at module load time.
            # Include it in the isolated checkout, even when reading only PUBLIC_FILES.
            for name in ("sync_frontend_payloads.py", "build_jd_shards.mjs", "public_assets.mjs", "guest_preview.mjs"):
                target = checkout / "scripts" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / "scripts" / name, target)
            # The guest preview's shared business calendar is a real package dependency.
            shutil.copy2(ROOT / "calendar-date.js", checkout / "calendar-date.js")
            for name in ("build_frontend_payload.py", "jev_preprocess.py", "linkedin_ids.py", "logo_sources.py", "track_jd_changes.py", "posting_dates.py"):
                target = checkout / "scripts" / "jobspy" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / "scripts" / "jobspy" / name, target)
            (checkout / "jobs.json").write_text(json.dumps({"jobs": [{"title": "Engineer", "company": "Acme", "link": "https://www.linkedin.com/jobs/view/12345678", "descriptionText": "Build and operate reliable data pipelines for business applications."}]}), encoding="utf-8")
            (checkout / "company-logos.json").write_text(json.dumps({"acme": "assets/company-logos/" + "a" * 24 + ".svg", "historical": "assets/company-logos/" + "b" * 24 + ".webp"}), encoding="utf-8")
            state = checkout / "data" / "company-logos" / "state.json"
            state.parent.mkdir(parents=True, exist_ok=True)
            state.write_text(json.dumps({"acme": {"status": "ready", "imageKind": "placeholder"}}), encoding="utf-8")
            # This fixture exercises the real public pack as well as payload sync.
            public_files = json.loads(subprocess.check_output(("node", "--input-type=module", "-e", "import {PUBLIC_FILES} from './scripts/public_assets.mjs'; console.log(JSON.stringify(PUBLIC_FILES))"), cwd=checkout))
            for name in public_files:
                if name in ("jobs-index.json", "company-logos.json", "calendar-date.js"):
                    continue
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("<html></html>" if name == "index.html" else "", encoding="utf-8")
            for name in ("a" * 24 + ".svg", "b" * 24 + ".webp"):
                asset = checkout / "assets" / "company-logos" / name
                asset.parent.mkdir(parents=True, exist_ok=True)
                asset.write_bytes(b"fixture")
            (checkout / ".gitignore").write_text("public-assets/\n", encoding="utf-8")
            for name in ("jobs-index.json", "jobs-details.json", "data/jev-boilerplate.json"):
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("{}\n", encoding="utf-8")
            subprocess.run(("git", "-C", str(checkout), "add", "."), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "seed"), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "branch", "-M", "main"), check=True, capture_output=True)
            subprocess.run(("git", "-C", str(checkout), "push", "-u", "origin", "main"), check=True, capture_output=True)
            # Production checkouts and main refreshes need only the current tree.
            shallow=root/'shallow'
            subprocess.run(('git','clone','--depth=1','--branch','main',remote.as_uri(),str(shallow)),check=True,capture_output=True)
            checkout=shallow
            self.assertEqual(subprocess.check_output(('git','rev-parse','--is-shallow-repository'),cwd=checkout,text=True).strip(),'true')
            command = (sys.executable, "scripts/sync_frontend_payloads.py")
            repaired=subprocess.run((*command, "--publish"), cwd=checkout, check=True, capture_output=True,text=True)
            self.assertEqual(repaired.stdout.count('frontend_index_jobs'),2)
            clean=subprocess.run((*command, "--publish"), cwd=checkout, check=True, capture_output=True,text=True)
            self.assertEqual(clean.stdout.count('frontend_index_jobs'),1)
            index = json.loads((checkout / "jobs-index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(index["jobs"]), 1)
            self.assertEqual(len(index["companyLogos"]), 2)
            self.assertEqual(index["companyLogoFallback"], index["companyLogos"]["acme"])
            subprocess.run(command, cwd=checkout, check=True, capture_output=True)
            subprocess.run((sys.executable, "scripts/jobspy/build_frontend_payload.py"), cwd=checkout, check=True, capture_output=True)
            python_index = (checkout / "jobs-index.json").read_bytes()
            subprocess.run(("node", "scripts/build_jd_shards.mjs"), cwd=checkout, check=True, capture_output=True)
            self.assertEqual((checkout / "jobs-index.json").read_bytes(), python_index)
            jobs = checkout / "jobs.json"
            jobs.write_text(jobs.read_text(encoding="utf-8").replace("Engineer", "Analyst"), encoding="utf-8")
            self.assertNotEqual(subprocess.run(command, cwd=checkout, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()

