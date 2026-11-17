#!/usr/bin/env python3
"""Apply liveness observations to canonical jobs idempotently."""
from __future__ import annotations
import argparse, json
from datetime import datetime, timezone
from pathlib import Path
from job_liveness import LIVENESS_EXPIRED_REASONS, apply_observation, jid, in_scope, parse_time, deletion_check_confirmed, NON_TARGET_RETENTION_DAYS
from logo_sources import validate_hint

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--jobs",required=True); ap.add_argument("--liveness",required=True); ap.add_argument("--output",required=True); ap.add_argument("--gone-confirm-hours",type=float,default=12); ap.add_argument("--delete-after-days",type=float,default=NON_TARGET_RETENTION_DAYS); args=ap.parse_args()
    doc=json.loads(Path(args.jobs).read_text(encoding="utf-8")); out=dict(doc) if isinstance(doc,dict) else {"jobs":doc}
    try: live=json.loads(Path(args.liveness).read_text(encoding="utf-8"))
    except (FileNotFoundError,json.JSONDecodeError):
        Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); return
    legacy = isinstance(live, dict) and live.get("schemaVersion") == "1.0" and live.get("mode") == "cn-job-liveness"
    regional = isinstance(live, dict) and live.get("schemaVersion") == "1.1" and live.get("mode") == "job-liveness"
    if not (legacy or regional) or not isinstance(live.get("observations"), list):
        Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); return
    scope = ["CN"] if legacy else [x for x in live.get("scopeLocations", []) if x in {"CN", "HK", "SG"}]
    def eligible_scope(row):
        return any(in_scope(row, loc) for loc in scope)
    by={jid(row):row for row in out.get("jobs",[]) if isinstance(row,dict) and jid(row)}; stats={"open":0,"reactivated":0,"expired_closed":0,"expired_not_accepting":0,"expired_gone":0,"pending":0,"unknown":0,"skipped_out_of_scope":0,"reposts":0,"stale_observations":0}
    for obs in live["observations"]:
        row=by.get(str(obs.get("jobId") or "")) or by.get(jid(obs)); result=obs.get("result")
        if not row or not eligible_scope(row): stats["skipped_out_of_scope"]+=1; continue
        before=row.get("jobStatus"); old_push=row.get("pushTime"); old_check=row.get("liveCheckedAt")
        apply_observation(row,result,obs.get("checkedAt"),args.gone_confirm_hours,obs.get("datePosted"),obs.get("dateSource"),args.delete_after_days,date_raw=obs.get("datePostedRaw"))
        if row.get("liveCheckedAt") == old_check:
            stats["stale_observations"] += 1
            continue
        hint=obs.get('companyLogoSource')
        if validate_hint(hint,row.get('company'),row.get('link')): row['companyLogoSource']=hint
        stats["reposts"] += int(row.get("pushTime") != old_push)
        if result=="open": stats["open"]+=1; stats["reactivated"]+=int(before=="expired" and row.get("jobStatus")=="active")
        elif result=="closed": stats["expired_closed"]+=int(row.get("expiredReason")=="linkedin_closed")
        elif result=="gone": stats["expired_gone"]+=int(row.get("expiredReason")=="linkedin_removed"); stats["pending"]+=int(row.get("expiredReason")!="linkedin_removed")
        elif result=="not_accepting": stats["expired_not_accepting"]+=int(row.get("expiredReason")=="linkedin_not_accepting"); stats["pending"]+=int(row.get("expiredReason")!="linkedin_not_accepting")
        else: stats["unknown"]+=1
    now=datetime.now(timezone.utc); kept=[]; deleted=0
    for row in by.values():
        expired_at=parse_time(row.get("expiredAt"))
        eligible=(eligible_scope(row) and row.get("jobStatus")=="expired" and row.get("expiredReason") in LIVENESS_EXPIRED_REASONS and expired_at and (now-expired_at).total_seconds() >= args.delete_after_days*24*3600 and deletion_check_confirmed(row,now,args.delete_after_days))
        if eligible:
            deleted += 1
        else:
            kept.append(row)
    out["jobs"]=kept; out["count"]=len(kept); out["liveness"]={"observedAt":live.get("observedAt"),"scopeLocations":scope,"deleted_after_days":deleted,**stats}
    Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out["liveness"],ensure_ascii=False))
if __name__ == "__main__": main()
