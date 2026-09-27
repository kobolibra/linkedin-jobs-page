import unittest

from track_jd_changes import annotate, diff_tokens


class TrackJdChangesTests(unittest.TestCase):
    def test_diff_marks_insertions_and_deletions(self):
        diff = diff_tokens("Manage risk reporting", "Manage credit risk reporting")
        self.assertIn("<ins> credit</ins>", diff)

        diff = diff_tokens("Own daily reporting", "Own weekly reporting")
        self.assertIn("<del>daily</del>", diff)
        self.assertIn("<ins>weekly</ins>", diff)

    def test_repost_with_unchanged_jd_keeps_no_diff(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000001",
            "descriptionHtml": "<p>Manage risk reporting.</p>",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000001",
            "jobspyRepost": True,
            "descriptionHtml": "<p>Manage risk reporting.</p>",
        }]}
        row = annotate(existing, snapshot, "2026-09-28T00:00:00Z")["jobs"][0]
        self.assertEqual(row["jdChangeStatus"], "unchanged")
        self.assertNotIn("jdDiffHtml", row)

    def test_repost_with_changed_jd_emits_track_changes(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000002",
            "descriptionHtml": "<p>Manage daily reporting.</p>",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000002",
            "jobspyRepost": True,
            "descriptionHtml": "<p>Manage weekly reporting and controls.</p>",
        }]}
        row = annotate(existing, snapshot, "2026-09-28T00:00:00Z")["jobs"][0]
        self.assertEqual(row["jdChangeStatus"], "changed")
        self.assertIn("<del>daily</del>", row["jdDiffHtml"])
        self.assertIn("<ins>weekly</ins>", row["jdDiffHtml"])
        self.assertIn("<ins>reporting and controls.</ins>", row["jdDiffHtml"])
        self.assertEqual(row["descriptionHtml"], snapshot["jobs"][0]["descriptionHtml"])

    def test_non_repost_is_not_diffed(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000003",
            "descriptionHtml": "<p>Old JD.</p>",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000003",
            "jobspyRepost": False,
            "descriptionHtml": "<p>New JD.</p>",
        }]}
        row = annotate(existing, snapshot)["jobs"][0]
        self.assertNotIn("jdDiffHtml", row)
        self.assertNotIn("jdChangeStatus", row)


if __name__ == "__main__":
    unittest.main()
