import unittest
from merge_n8n_incremental import merge_documents
from job_liveness import apply_observation

class SalaryChanges(unittest.TestCase):
    def batch(self, salary=None, jobs=None):
        return {'generatedAt':'2026-10-01T00:00:00Z','jobs':jobs or [],'salaryRows':[] if salary is None else [{'Company':'HSBC','Title':'Analyst','Location':salary}]}
    def row(self, **kw):
        return {'sourceJobId':'li-123456789','company':'HSBC','title':'Analyst','location':'CN', **kw}
    def test_changes_persist_and_update(self):
        base={'jobs':[self.row(jobStatus='active',salary='10k')]}
        a=merge_documents(base,self.batch('20k'))
        self.assertEqual((a['jobs'][0]['salaryPrevious'],a['jobs'][0]['salary']),('10k','20k'))
        b=merge_documents(a,self.batch('20k'))
        self.assertEqual(b['jobs'][0]['salaryPrevious'],'10k')
        c=merge_documents(b,self.batch('30k'))
        self.assertEqual((c['jobs'][0]['salaryPrevious'],c['jobs'][0]['salary']),('20k','30k'))
    def test_new_and_expired(self):
        a=merge_documents({'jobs':[self.row(jobStatus='active')]},self.batch('20k'))
        self.assertNotIn('salaryPrevious',a['jobs'][0])
        a=merge_documents({'jobs':[self.row(jobStatus='expired',salary='10k')]},self.batch('20k'))
        self.assertNotIn('salaryPrevious',a['jobs'][0])
    def test_incoming_salary_does_not_change_existing_merge_behavior(self):
        base={'jobs':[self.row(jobStatus='active',salary='10k')]}
        a=merge_documents(base,self.batch(None,[self.row(salary='20k')]))
        self.assertEqual(a['jobs'][0]['salary'],'20k')
    def test_liveness_reopen_clears_prior_marker(self):
        row=self.row(jobStatus='expired',expiredReason='linkedin_closed',salary='20k',salaryPrevious='10k')
        result=apply_observation(row,'open','2026-10-01T00:00:00Z')
        self.assertEqual(result['jobStatus'],'active')
        self.assertNotIn('salaryPrevious',result)
if __name__=='__main__': unittest.main()
