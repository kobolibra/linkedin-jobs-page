import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import trae_company_review as entry


class TraeEntrypointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.run = Path(self.tmp.name) / "run.test"
        self.root = self.run / "repo"
        self.root.mkdir(parents=True)
        self.cfg = self.run / "config.json"
        self.cfg.write_text(json.dumps({"repo": entry.REPO, "branch": "main", "github_token": "test-only"}))
        for path in entry.KEY_FILES:
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("trusted " + path)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(["git", "-C", str(self.root), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=Test", "-c",
                        "user.email=test@example.com", "commit", "-qm", "fixture"], check=True)
        self.sha = entry.git(self.root, "rev-parse", "HEAD")
        self.manifest = {"codeCommit": self.sha, "dataCommit": self.sha,
                         "scripts": [{"path": p, "sha256": entry.digest(self.root / p)}
                                     for p in entry.KEY_FILES]}

    def tearDown(self):
        self.tmp.cleanup()

    def test_workspace_credentials_only_and_python_isolation(self):
        with patch.dict(os.environ, {"PYTHONPATH": "/workspace", "PYTHONHOME": "/old", "GIT_DIR": "/old"}):
            env = entry.child_env(self.run, self.cfg)
        self.assertNotIn("PYTHONPATH", env)
        self.assertNotIn("PYTHONHOME", env)
        self.assertNotIn("GIT_DIR", env)
        self.assertEqual(env["GITHUB_TOKEN"], "test-only")
        self.assertEqual(env["NEXT_JOURNEY_OUTPUT_DIR"], str(self.run))
        self.assertEqual(entry.script_command(self.root, "reclassify.py", [])[1:],
                         ["-I", "-B", str(self.root / "reclassify.py")])
        self.cfg.write_text(json.dumps({"repo": "wrong/repo", "branch": "main", "github_token": "test"}))
        with self.assertRaises(ValueError):
            entry.load_config(self.cfg)

    def test_modified_or_untracked_business_code_is_refused(self):
        entry.check_code(self.root, self.manifest)
        (self.root / "reclassify.py").write_text("stale")
        with self.assertRaisesRegex(RuntimeError, "modified"):
            entry.check_code(self.root, self.manifest)
        subprocess.run(["git", "-C", str(self.root), "checkout", "--", "reclassify.py"], check=True)
        (self.root / "scripts" / "old.py").write_text("stale")
        with self.assertRaisesRegex(RuntimeError, "untracked"):
            entry.check_code(self.root, self.manifest)

    def test_new_remote_code_blocks_refresh(self):
        with patch.object(entry, "check_code"), patch.object(entry, "git",
                side_effect=["", "b" * 40, "scripts/company_review_queue.py"]):
            with self.assertRaisesRegex(RuntimeError, "GitHub business code changed"):
                entry.refresh(self.root, self.run, self.manifest)

    def test_legacy_flags_and_external_roots_are_refused(self):
        for action, args in [("reclassify", ["--blacklist", "Example"]),
                             ("reclassify", ["--local-root=/workspace"]),
                             ("queue", ["--root=/workspace"])]:
            with self.assertRaises(ValueError):
                entry.checked_arguments(action, args, self.root, self.run)
        self.assertEqual(entry.checked_arguments("queue", ["--write"], self.root, self.run),
                         ["--write", "--root", str(self.root)])
        self.assertEqual(entry.checked_arguments("reclassify", ["--blacklist-records", "[]"], self.root, self.run),
                         ["--blacklist-records", "[]"])

    def test_data_only_refresh_preserves_pinned_code(self):
        self.manifest["scripts"] = []
        with patch.object(entry, "check_code"), patch.object(entry, "git",
                side_effect=["", "b" * 40, "", self.sha, "", ""]):
            entry.refresh(self.root, self.run, self.manifest)
        self.assertEqual(self.manifest["codeCommit"], self.sha)
        self.assertEqual(self.manifest["dataCommit"], "b" * 40)


if __name__ == "__main__":
    unittest.main()
