import unittest

from track_jd_changes import annotate, diff_tokens, formatted_diff
from bs4 import BeautifulSoup


class TrackJdChangesTests(unittest.TestCase):
    def test_revision_keeps_source_blocks_emphasis_and_current_text_exactly(self):
        source='<div><p><strong>Responsibilities</strong></p><ul><li>Manage weekly reporting and controls.</li><li><em>Support clients</em></li></ul></div>'
        result=formatted_diff('Responsibilities Manage daily reporting. Support clients',source)
        soup=BeautifulSoup(result,'html.parser');original=BeautifulSoup(source,'html.parser')
        for tag in ('div','p','strong','ul','li','em'):
            self.assertEqual(len(soup.select(tag)),len(original.select(tag)))
        self.assertIn('daily', ' '.join(x.get_text() for x in soup.select('del')))
        self.assertTrue(soup.select('ins'))
        for deleted in soup.select('del'):deleted.decompose()
        for inserted in soup.select('ins'):inserted.unwrap()
        self.assertEqual(str(soup),str(original))

    def test_trailing_deletions_and_special_characters_keep_original_markup(self):
        source='<p><b>Risk &amp; controls</b></p>'
        result=formatted_diff('Risk & controls worldwide',source)
        soup=BeautifulSoup(result,'html.parser')
        self.assertEqual(soup.select_one('b').get_text(),'Risk & controls')
        self.assertEqual(soup.select_one('del').get_text().strip(),'worldwide')
        self.assertEqual(formatted_diff('Risk & controls',source),source)

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
        diff=BeautifulSoup(row['jdDiffHtml'],'html.parser')
        self.assertIn('daily', ' '.join(x.get_text() for x in diff.select('del')))
        self.assertIn('weekly reporting and controls.', ' '.join(x.get_text() for x in diff.select('ins')))
        self.assertEqual(len(diff.select('p')),1)
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
