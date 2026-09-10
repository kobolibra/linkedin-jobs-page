#!/usr/bin/env python3
"""Compare full CN JobSpy ids; add lifecycle fields only to target CN jobs."""
import argparse,json
from datetime import datetime,timezone
from pathlib import Path
TARGETS={"hsbc","standard chartered","citi","jpmorgan chase","bnp paribas","societe generale","dbs bank","deutsche bank","goldman sachs","blackrock"}
def canon(v): return " ".join(str(v or "").casefold().replace("&","and").split())
def jid(x): return str(x.get("sourceJobId") or x.get("link") or "").strip()
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--jobs",required=True);ap.add_argument("--full",required=True);ap.add_argument("--successful",required=True);ap.add_argument("--output",required=True);ap.add_argument("--date",default=datetime.now(timezone.utc).date().isoformat());a=ap.parse_args()
 jobs=json.loads(Path(a.jobs).read_text());full=json.loads(Path(a.full).read_text());successful=set(json.loads(Path(a.successful).read_text()))
 jobs=jobs if isinstance(jobs,list) else jobs.get("jobs",[]);full=full if isinstance(full,list) else full.get("jobs",[]);seen={jid(x) for x in full if jid(x)}
 stats={"checked":0,"expired":0,"reactivated":0}
 out=[]
 for row in jobs:
  x=dict(row);company=canon(x.get("companyCanonical") or x.get("company") or x.get("requestedCompany"))
  if x.get("location")=="CN" and company in TARGETS and company in successful and jid(x):
   stats["checked"]+=1
   if jid(x) in seen:
    if x.get("jobStatus")=="expired":stats["reactivated"]+=1
    x["jobStatus"]="active";x.pop("expiredAt",None)
   else:
    if x.get("jobStatus")!="expired":stats["expired"]+=1
    x["jobStatus"]="expired";x["expiredAt"]=a.date
  out.append(x)
 Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({**stats,"fullJobIds":len(seen)},ensure_ascii=False))
if __name__=="__main__":main()
