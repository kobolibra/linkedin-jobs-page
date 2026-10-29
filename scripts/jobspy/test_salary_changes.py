import unittest
from merge_n8n_incremental import merge_documents
from job_liveness import apply_observation
class SalaryChanges(unittest.TestCase):
 def row(self, **fields): return {'sourceJobId':'li-123456789','company':'HSBC','title':'Analyst','location':'CN',**fields}
 def batch(self, salary): return {'jobs':[], 'salaryRows':[{'Company':'HSBC','Title':'Analyst','Location':salary}]}
 def test_full_history_and_repeat(self):
  doc={'jobs':[self.row(jobStatus='active',salary='A')]}
  for value,expected in [('B',['A']),('B',['A']),('C',['A','B']),('A',['A','B','C'])]:
   doc=merge_documents(doc,self.batch(value));self.assertEqual(doc['jobs'][0]['salaryHistory'],expected);self.assertEqual(doc['jobs'][0]['salary'],value)
 def test_expiry_freeze_and_reopen(self):
  row=self.row(jobStatus='expired',expiredReason='linkedin_closed',salary='B',salaryHistory=['A'])
  doc=merge_documents({'jobs':[row]},self.batch('C'));row=doc['jobs'][0]
  self.assertEqual((row['salary'],row['salaryHistory']),('B',['A']))
  row=apply_observation(row,'open','2026-10-01T00:00:00Z');doc=merge_documents({'jobs':[row]},self.batch('C'))
  self.assertEqual((doc['jobs'][0]['salary'],doc['jobs'][0]['salaryHistory']),('C',['A','B']))
 def test_legacy_history_retained(self):
  row=self.row(jobStatus='active',salary='B',salaryPrevious='A');doc=merge_documents({'jobs':[row]},self.batch('C'))
  self.assertEqual(doc['jobs'][0]['salaryHistory'],['A','B'])
if __name__=='__main__': unittest.main()
