"""Offline coverage for deferred JD transport; never calls LinkedIn."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import fetch_details_parallel as details


class DetailSchedulingTests(unittest.TestCase):
    def run_fixture(self, always_deferred=False):
        calls = []
        def one(item, *args):
            key = item['sourceJobId']
            calls.append(key)
            if key == 'li-111111111' and (always_deferred or calls.count(key) == 1):
                return {**item, 'detailStatus':'blocked', 'detailRetryable':True}
            result = {**item, 'detailStatus':'ok', 'descriptionHtml':'<p>Original <b>JD</b></p>'}
            result.pop('detailRetryable', None)
            return result
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'in.json'; target=root/'out.json'
            source.write_text(json.dumps({'jobs':[{'sourceJobId': 'li-111111111'}, {'sourceJobId': 'li-222222222'}]}))
            with patch.object(details,'one',side_effect=one), patch.object(sys,'argv',['details','--input',str(source),'--output',str(target),'--workers','1','--attempts','3']):
                self.assertEqual(details.main(), 0)
            return calls, json.loads(target.read_text())

    def test_other_job_is_processed_before_deferred_retry_and_attempts_are_unique(self):
        calls, result = self.run_fixture()
        self.assertEqual(calls, ['li-111111111','li-222222222','li-111111111'])
        self.assertEqual(result['health']['attempted'], 2)
        self.assertEqual(result['health']['ok'], 2)
        self.assertEqual(result['jobs'][0]['descriptionHtml'], '<p>Original <b>JD</b></p>')

    def test_persistent_failure_retains_both_jobs_and_stops_after_three_rounds(self):
        calls, result = self.run_fixture(True)
        self.assertEqual(calls.count('li-111111111'), 3)
        self.assertEqual(calls.count('li-222222222'), 1)
        self.assertEqual(len(result['jobs']), 2)
        self.assertEqual(result['health']['attempted'], 2)
        self.assertEqual(result['health']['blocked'], 1)


if __name__ == '__main__': unittest.main()
