"""Real-engine startup regressions; intercepted requests and synthetic accounts only."""
import asyncio, mimetypes, os
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
async def main():
 from playwright.async_api import async_playwright
 async with async_playwright() as p:
  browser=await getattr(p,os.getenv('JOURNEY_TEST_BROWSER','chromium')).launch(headless=True)
  for guest in [False,True]:
   context=await browser.new_context();page=await context.new_page();requests=[];errors=[];version='a'*64;optional_done=False
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    nonlocal optional_done
    u=urlparse(r.request.url);path=u.path.lstrip('/');requests.append(path)
    if u.netloc!='local.test':await r.abort();return
    if path=='auth/session':
     await asyncio.sleep(.08);await r.fulfill(status=401 if guest else 200,json={'error':'sign_in_required'} if guest else {'enabled':True,'user':{'id':'test-person','name':'Test'},'csrf':'test-csrf'});return
    if path=='auth/preferences':await r.fulfill(json={'userId':'test-person','entries':[],'cursor':0,'more':False});return
    if path in ['jobs-index.json','api/public-preview']:
     await asyncio.sleep(.03);await r.fulfill(json={'dataVersion':version,'jobs':[dict(title='Fresh role '+version[0],company='HSBC',location='HK',city='Hong Kong',link='https://www.linkedin.com/jobs/view/4000000001',firstSeen='2026-11-04T00:00:00Z',hasJd=True,jobStatus='active')]});return
    if path=='jobs-version.json':await r.fulfill(json={'dataVersion':version});return
    if path=='guestbook.js':await asyncio.sleep(2);optional_done=True
    file=ROOT/(path or 'index.html')
    if file.is_file():
     body=file.read_bytes()
     if not path and guest:body=body.replace(b'<html ',b'<html data-auth-state="guest" ')
     await r.fulfill(body=body,content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
    else:await r.fulfill(status=404,body='missing')
   await page.route('**/*',route)
   await page.goto('https://local.test/',wait_until='domcontentloaded')
   await page.wait_for_selector('.job',timeout=3000)
   assert not optional_done,'Slow guestbook blocked the first job'
   assert await page.locator('.job-title').inner_text()=='Fresh role a'
   assert requests.count('job-store.js')==1,requests
   assert not any(x.startswith('jd-parts/') for x in requests)
   assert requests.count('api/public-preview' if guest else 'jobs-index.json')==1
   if guest:
    assert 'jobs-index.json' not in requests and 'jobs-version.json' not in requests and 'account-sync.js' not in requests,requests
   else:
    assert await page.locator('.account-name').inner_text()=='Test'
    await page.wait_for_timeout(150)
    before=requests.count('jobs-index.json')
    await page.reload(wait_until='domcontentloaded');await page.wait_for_selector('.job',timeout=3000)
    assert requests.count('jobs-index.json')==before,'Unchanged deployment redownloaded full index'
    version='b'*64
    await page.reload(wait_until='domcontentloaded');await page.wait_for_selector('.job',timeout=3000)
    assert await page.locator('.job-title').inner_text()=='Fresh role b'
    assert requests.count('jobs-index.json')==before+1,'Changed deployment must fetch exactly once'
   assert not errors,errors
   print(('guest' if guest else 'authenticated')+' startup, optional isolation, freshness, lazy JD: PASS',flush=True)
   await context.close()
  await browser.close()
if __name__=='__main__':asyncio.run(main())
