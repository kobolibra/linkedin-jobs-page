#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, random, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import requests
from bs4 import BeautifulSoup

def www(url:str)->str:
 p=urlsplit(url); return urlunsplit(("https","www.linkedin.com",p.path.rstrip("/"),p.query,""))
def fetch(s, item, timeout, attempts):
 item["link"]=www(item.get("link", "")); last=""
 for n in range(1, attempts+1):
  try:
   r=s.get(item["link"],timeout=(10,timeout))
   if r.status_code==429 or r.status_code>=500:
    last=f"HTTP {r.status_code}"
    if n<attempts: time.sleep(min(45,2**n+random.random())); continue
   r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser")
   block=soup.select_one("div.show-more-less-html__markup") or soup.select_one("div.description__text")
   locs=soup.select("div.top-card-layout__card span.topcard__flavor")
   if block:
    item["descriptionText"]=block.get_text("\n",strip=True); item["descriptionHtml"]=str(block)
   company=str(item.get("company") or "").strip()
   for loc in locs:
    raw=loc.get_text(" ",strip=True)
    if raw and company and raw.casefold()==company.casefold(): continue
    if raw and ("," in raw or "china" in raw.casefold()):
     item["locationRaw"]=raw; break
   item["status"]="ok" if item.get("descriptionText") else "empty"
   item["lastError"]=None; item["fetchedAt"]=datetime.now(timezone.utc).isoformat(); return
  except requests.RequestException as e:
   last=str(e)
   if n<attempts: time.sleep(min(45,2**n+random.random()))
 item["status"]="failed"; item["lastError"]=last; item["attempts"]=int(item.get("attempts") or 0)+attempts; item["fetchedAt"]=datetime.now(timezone.utc).isoformat()
def main():
 ap=argparse.ArgumentParser(); ap.add_argument("--queue",type=Path,required=True); ap.add_argument("--output",type=Path,required=True); ap.add_argument("--timeout",type=int,default=15); ap.add_argument("--attempts",type=int,default=3); ap.add_argument("--delay",type=float,default=3); a=ap.parse_args()
 d=json.loads(a.queue.read_text(encoding="utf-8")); items=d.get("jobs",[]); s=requests.Session(); s.headers.update({"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36","Accept-Language":"en-US,en;q=0.9"})
 for i,item in enumerate(items,1):
  if item.get("status")=="ok" and item.get("descriptionHtml"): continue
  print(f"detail {i}/{len(items)} {item.get('sourceJobId')}",flush=True); fetch(s,item,a.timeout,a.attempts); a.output.write_text(json.dumps({"schemaVersion":"1.1","generatedAt":datetime.now(timezone.utc).isoformat(),"count":len(items),"jobs":items},ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); time.sleep(a.delay+random.random()*2)
 print(json.dumps({"total":len(items),"ok":sum(x.get('status')=='ok' for x in items),"empty":sum(x.get('status')=='empty' for x in items),"failed":sum(x.get('status')=='failed' for x in items)},ensure_ascii=False))
if __name__=='__main__':main()
