"""Synthetic viewport regression; requires Playwright and installed browser binaries.
Run with JOURNEY_TEST_BROWSER=chromium or webkit. All requests are intercepted;
this script never signs into, reads, or changes production account data.
"""
import asyncio,json,mimetypes,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
async def main():
 from playwright.async_api import async_playwright
 ARTIFACTS=Path(tempfile.mkdtemp(prefix='journey-viewports-'))
 async with async_playwright() as p:
  browser=await getattr(p,os.environ.get('JOURNEY_TEST_BROWSER','chromium')).launch(headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  entries={};rev=0;requests=[]
  jobs=[dict(title='Investment Banking Analyst' if i==0 else 'Asset Management Associate '+str(i),company=['HSBC','BlackRock','UBS'][i%3],location=['CN','HK','SG'][i%3],city=['Shanghai','Hong Kong','Singapore'][i%3],link='https://www.linkedin.com/jobs/view/'+str(4000000000+i),firstSeen='2026-11-03T00:00:00Z',pushTime='2026-11-03T00:00:00Z',hasJd=True,jobStatus='active') for i in range(12)]
  async def route(r):
   nonlocal rev
   from urllib.parse import urlparse,parse_qs
   url=urlparse(r.request.url);path=url.path.lstrip('/');requests.append(path)
   if url.netloc!='local.test':await r.abort();return
   if path=='auth/session':await r.fulfill(json={'enabled':True,'user':{'id':'test-person','name':'Test Person'},'csrf':'test-csrf'});return
   if path=='auth/preferences':
    ack=[]
    if r.request.method=='POST':
     for op in r.request.post_data_json['operations']:
      rev+=1;entries[(op['kind'],op['item'])]=dict(kind=op['kind'],item=op['item'],present=op['present'],revision=rev);ack.append(op['id'])
     await r.fulfill(json={'userId':'test-person','acknowledged':ack});return
    since=int(parse_qs(url.query).get('since',['0'])[0]);await r.fulfill(json={'userId':'test-person','entries':[v for v in entries.values() if v['revision']>since],'cursor':rev,'more':False});return
   if path=='jobs-index.json':await r.fulfill(json={'dataVersion':'a'*64,'jobs':jobs});return
   if path=='jobs-version.json':await r.fulfill(json={'dataVersion':'a'*64});return
   if path.startswith('jd-parts/'):
    await r.fulfill(json={'details':{ 'ln:'+str(4000000000+i):{'descriptionHtml':'<p>Responsibilities include financial analysis and investment research.</p>','descriptionText':'Responsibilities include financial analysis and investment research.'} for i in range(12)}});return
   file=ROOT/(path or 'index.html')
   if file.is_file():await r.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
   else:await r.fulfill(status=404,body='Not found')
  await page.route('**/*',route)
  await page.goto('https://local.test/')
  await page.wait_for_selector('.job',timeout=10000)
  await page.wait_for_timeout(1200)
  card=page.locator('.job').first
  await card.hover();await card.locator('.star').click();await page.wait_for_timeout(100)
  trigger=card.locator('.application-trigger');assert await trigger.count()==1
  jd=card.locator('.job-jd summary');before=await jd.bounding_box()
  await trigger.hover();await page.wait_for_timeout(180)
  assert await page.locator('.application-editor').is_visible()
  for stage in ['applied','contact','first','second','no_response','rejected']:
   await page.locator('.application-editor [data-stage="'+stage+'"]').click();await page.wait_for_timeout(100)
   assert await page.locator('.application-editor').is_visible()

  await page.screenshot(path=str(ARTIFACTS/'application-debug.png'))
  assert await card.locator('.ap-trigger-label').text_content()=='Rejected'
  after=await jd.bounding_box();assert before['y']==after['y'] and before['x']==after['x'],(before,after)
  await page.locator('.ap-history summary').click()
  assert await page.locator('.ap-history li').count()==6
  await page.screenshot(path=str(ARTIFACTS/'application-editor-desktop.png'))
  await page.locator('.application-editor .ap-close').click()
  await jd.click();await page.wait_for_timeout(500)

  await page.wait_for_selector('.job-jd-text p',timeout=3000)
  assert 'financial analysis' in await card.locator('.job-jd-text').inner_text()
  if not await page.locator('.application-journey-toggle').is_visible():await page.locator('#favToggle').click()
  await page.evaluate("""()=>{for(let i=1;i<61;i++){const j='ln:sample'+i,k=i%12;let ev;const region=['CN','HK','SG'][i%3];let route=k<2?['saved']:k===2?['applied','contact']:k===3?['applied','contact','no_response']:k===4?['applied']:k===5?['applied','no_response']:k===6?['applied','rejected']:k===7?['applied','contact','first']:k===8?['applied','contact','first','second']:k===9?['applied','contact','first','second','final']:k===10?['applied','contact','first','second','final','offer']:['applied','contact','first','second','rejected'];for(const stage of route)ev=JobApplications.transition(ev,stage,{job:j,id:crypto.randomUUID().replaceAll('-',''),time:Date.now(),region});const data=AccountPreferences.snapshot();AccountPreferences.set('applications',JSON.stringify([...data.applications,JSON.stringify(ev)]));AccountPreferences.set('favs',JSON.stringify([...AccountPreferences.snapshot().favs,j]));}}""")
  await page.locator('.application-journey-toggle').screenshot(path=str(ARTIFACTS/'my-journey-button.png'))
  assert await page.locator('.account-journey .ap-journey-mark').count()==1
  await page.locator('.application-journey-toggle').click()
  assert await page.locator('.ap-chart > svg').count()==1
  assert await page.locator('#ap-journey-title').inner_text()=='Your application journey'
  assert 'YOUR NEXT JOURNEY' not in await page.locator('.application-journey').inner_text()
  assert 'All saved roles, across every filter.' not in await page.locator('.application-journey').inner_text()
  assert (await page.locator('.application-journey-entry').text_content()).strip()=='My Journey'
  assert await page.locator('.application-journey-entry').evaluate('(e)=>getComputedStyle(e).borderTopWidth')=='0px'
  async def fit_report(target,label):
   await target.wait_for_timeout(140)
   report=await target.evaluate("""()=>{const d=document.querySelector('.application-journey'),p=d.querySelector('.ap-chart'),s=p.querySelector('svg'),b=d.getBoundingClientRect(),v={w:innerWidth,h:innerHeight},c=p.getBoundingClientRect();const cut=[...s.querySelectorAll('text')].map(t=>({text:t.textContent,b:t.getBoundingClientRect()})).filter(o=>o.b.left<c.left-1||o.b.right>c.right+1||o.b.top<c.top-1||o.b.bottom>c.bottom+1).map(o=>o.text);return{viewport:v,dialog:{x:b.x,y:b.y,w:b.width,h:b.height},overflowY:d.scrollHeight-d.clientHeight,overflowX:d.scrollWidth-d.clientWidth,chartOverflowX:p.scrollWidth-p.clientWidth,chartOverflowY:p.scrollHeight-p.clientHeight,cut,transform:getComputedStyle(d).transform,compact:d.classList.contains('is-compact')};}""")
   assert report['dialog']['x']>=-1 and report['dialog']['y']>=-1,(label,report)
   assert report['dialog']['x']+report['dialog']['w']<=report['viewport']['w']+1,(label,report)
   assert report['dialog']['y']+report['dialog']['h']<=report['viewport']['h']+1,(label,report)
   assert report['overflowY']<=1 and report['overflowX']<=1,(label,report)
   assert report['chartOverflowX']<=1 and report['chartOverflowY']<=1,(label,report)
   assert not report['cut'],(label,report)
   print(json.dumps({'fit':label,**report}),flush=True)
  for w,h in [(1920,1080),(1440,900),(1366,768),(1280,720)]:
   await page.set_viewport_size({'width':w,'height':h})
   await fit_report(page,str(w)+'x'+str(h))
   await page.screenshot(path=str(ARTIFACTS/('journey-fit-'+str(w)+'x'+str(h)+'.png')))
  await page.evaluate('AccountPreferences.flush()')
  mobile_context=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
  mobile=await mobile_context.new_page();await mobile.route('**/*',route)
  await mobile.goto('https://local.test/');await mobile.wait_for_selector('.application-trigger',state='attached');await mobile.wait_for_timeout(300)
  await mobile.locator('#favToggle').click();await mobile.locator('.application-journey-toggle').click()
  await fit_report(mobile,'phone portrait -> default landscape')
  assert await mobile.locator('.application-journey').evaluate('(e)=>getComputedStyle(e).transform')!='none'
  await mobile.screenshot(path=str(ARTIFACTS/'journey-fit-phone-portrait.png'))
  await mobile.set_viewport_size({'width':844,'height':390});await fit_report(mobile,'phone physical landscape')
  assert await mobile.locator('.application-journey').evaluate('(e)=>getComputedStyle(e).transform')=='none'
  await mobile.screenshot(path=str(ARTIFACTS/'journey-fit-phone-landscape.png'))
  await mobile.set_viewport_size({'width':360,'height':800});await fit_report(mobile,'small phone -> default landscape')
  assert await mobile.locator('.application-journey .ap-close').evaluate('(e)=>e.getBoundingClientRect().width')>=44
  await mobile.locator('.application-journey .ap-close').tap();assert not await mobile.locator('.application-journey').is_visible()
  await mobile_context.close()
  await page.set_viewport_size({'width':1440,'height':900})
  await page.screenshot(path=str(ARTIFACTS/'application-journey-desktop.png'))
  assert await page.locator('.ap-region-tabs').count()==0
  assert await page.locator('.ap-regional-flows').count()==0
  labels=await page.locator('.ap-chart').inner_text()
  assert all(region in labels for region in ['Mainland China','Hong Kong','Singapore'])
  await page.evaluate('document.documentElement.dataset.theme="dark"')
  await page.screenshot(path=str(ARTIFACTS/'application-journey-dark.png'))
  await page.evaluate('document.documentElement.dataset.theme="light"')
  await page.locator('.application-journey .ap-close').click()
  # Reload reads account cache and server stage events, without touching shared job data.
  await page.reload();await page.wait_for_selector('.application-trigger',state='attached')
  assert await page.locator('.ap-trigger-label').first.text_content()=='Rejected'
  assert not errors,errors
  print(json.dumps({'desktop':'passed','regional_breakdown':'passed','new_statuses':'passed','JD_position':'unchanged','JD_expand':'passed','stage_history':6,'reload':'passed','errors':errors,'job_index_requests':requests.count('jobs-index.json')}))
  # Test the mobile touch action sheet and nested modal editor.
  await page.set_viewport_size({'width':390,'height':844})
  await page.evaluate('''()=>{const row=document.querySelector('.job'),r=row.getBoundingClientRect();row.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:77,pointerType:'touch',isPrimary:true,clientX:300,clientY:r.top+20}));row.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77,pointerType:'touch',isPrimary:true,clientX:120,clientY:r.top+20}));}''')
  await page.wait_for_selector('.job-action-sheet[open]')
  await page.locator('[data-action="application"]').click()
  await page.locator('.application-editor [data-stage="final"]').click()
  await page.screenshot(path=str(ARTIFACTS/'application-editor-mobile.png'))
  assert await page.locator('.application-editor').evaluate('(e)=>e.matches(":modal")')
  await page.locator('.application-editor .ap-close').click()
  await page.locator('.job-sheet-close').click()
  if not await page.locator('.application-journey-toggle').is_visible():await page.locator('#favToggle').click()
  await page.locator('.application-journey-toggle').click()
  await page.screenshot(path=str(ARTIFACTS/'application-journey-mobile.png'))
  print(json.dumps({'mobile':'passed','nested_modal':'passed','page_width':await page.evaluate('document.documentElement.scrollWidth'),'viewport':390,'errors':errors}))
  print('Viewport artifacts: '+str(ARTIFACTS),flush=True)
  await browser.close()
if __name__=='__main__':
 asyncio.run(main())
