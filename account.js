/* Authenticate and prepare account-scoped preferences before loading the app. */
(()=>{
 const sourceFetch=window.fetch.bind(window);let account=null,lastCheck=0;
 const ACCOUNT_MARK=`
  <svg class="account-mark" aria-hidden="true" viewBox="0 0 40 40" fill="none">
    <defs>
      <radialGradient id="msn-classic-ground" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13 8) rotate(54) scale(40)"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#dcebf1"/></radialGradient>
      <linearGradient id="msn-classic-green-head" x1="10" y1="5" x2="16" y2="18" gradientUnits="userSpaceOnUse"><stop stop-color="#e1ff94"/><stop offset=".44" stop-color="#8bd846"/><stop offset="1" stop-color="#398b39"/></linearGradient>
      <linearGradient id="msn-classic-green-body" x1="8" y1="20" x2="17" y2="35" gradientUnits="userSpaceOnUse"><stop stop-color="#baf75c"/><stop offset=".55" stop-color="#56bd45"/><stop offset="1" stop-color="#197148"/></linearGradient>
      <linearGradient id="msn-classic-blue-head" x1="20" y1="4" x2="27" y2="18" gradientUnits="userSpaceOnUse"><stop stop-color="#c1fbff"/><stop offset=".42" stop-color="#55c9f4"/><stop offset="1" stop-color="#1553b5"/></linearGradient>
      <linearGradient id="msn-classic-blue-body" x1="21" y1="19" x2="27" y2="37" gradientUnits="userSpaceOnUse"><stop stop-color="#76e1f6"/><stop offset=".48" stop-color="#158bd7"/><stop offset="1" stop-color="#123c96"/></linearGradient>
      <linearGradient id="msn-classic-wing-blue" x1="11" y1="16" x2="19" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#d8fbff"/><stop offset=".42" stop-color="#59c9f1"/><stop offset="1" stop-color="#3160bd"/></linearGradient>
      <linearGradient id="msn-classic-wing-orange" x1="20" y1="16" x2="29" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#fff69a"/><stop offset=".45" stop-color="#ffb340"/><stop offset="1" stop-color="#e64e35"/></linearGradient>
      <linearGradient id="msn-classic-wing-green" x1="11" y1="23" x2="19" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="#d8ff85"/><stop offset=".5" stop-color="#72ce43"/><stop offset="1" stop-color="#189b69"/></linearGradient>
      <linearGradient id="msn-classic-wing-yellow" x1="20" y1="23" x2="29" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="#fff5a3"/><stop offset=".5" stop-color="#ffcf39"/><stop offset="1" stop-color="#ee8b31"/></linearGradient>
      <clipPath id="msn-classic-crop"><circle cx="20" cy="20" r="19"/></clipPath>
    </defs>
    <circle cx="20" cy="20" r="19.2" fill="url(#msn-classic-ground)" stroke="#cbdde5" stroke-width=".8"/>
    <g clip-path="url(#msn-classic-crop)">
      <path d="M2.3 35.2c.2-8.2 4.6-13.4 11-14.9l4.9 3.2 4.7-3.1c6.1 1.5 9.4 6.3 9.6 14.8l-.4 3.5H2.7l-.4-3.5Z" fill="url(#msn-classic-green-body)" stroke="#f8ffff" stroke-opacity=".9" stroke-width=".65"/>
      <path d="M7.1 25.3c2.6-2.7 6.5-4.6 11-5.2" stroke="#efffc9" stroke-opacity=".7" stroke-width=".65" stroke-linecap="round"/>
      <circle cx="13.1" cy="11.1" r="5.6" fill="url(#msn-classic-green-head)" stroke="#f8ffff" stroke-width=".7"/>
      <ellipse cx="11.7" cy="8.8" rx="2.5" ry="1.1" fill="#fff" fill-opacity=".42"/>
      <path d="M11.2 15.2c1.1 1 2.6 1.5 4.1 1.4" stroke="#276f44" stroke-opacity=".45" stroke-width=".6" stroke-linecap="round"/>
      <path d="M12.5 35.5c.2-9.1 4.1-14.9 10.1-16.4l5.1 3.2 5-3.1c6.4 1.7 9.2 7.6 9.4 16.3l-.5 3.2H13l-.5-3.2Z" fill="url(#msn-classic-blue-body)" stroke="#f9ffff" stroke-opacity=".94" stroke-width=".7"/>
      <path d="M19.2 23.7c2.7-2.6 6.4-3.9 10-4" stroke="#c4f8ff" stroke-opacity=".82" stroke-width=".75" stroke-linecap="round"/>
      <circle cx="23.6" cy="10.5" r="6.2" fill="url(#msn-classic-blue-head)" stroke="#fff" stroke-width=".75"/>
      <ellipse cx="22" cy="7.8" rx="2.8" ry="1.25" fill="#fff" fill-opacity=".52"/>
      <path d="M20.3 15.2c1.8 1.5 4.6 1.9 6.4 1" stroke="#124e9b" stroke-opacity=".55" stroke-width=".65" stroke-linecap="round"/>
      <g stroke="#ffffff" stroke-width=".55" stroke-linejoin="round">
        <path d="M19.35 22.2c-2.4-1.6-6.5-6.5-8.3-5.7-1.9.9-.2 5.1 2.6 7.2 1.8 1.4 3.7 1.4 6.2.1Z" fill="url(#msn-classic-wing-blue)"/>
        <path d="M20.65 22.2c2.4-1.6 6.5-6.5 8.3-5.7 1.9.9.2 5.1-2.6 7.2-1.8 1.4-3.7 1.4-6.2.1Z" fill="url(#msn-classic-wing-orange)"/>
        <path d="M19.25 23c-2.6-.7-6.6-.5-7 1.6-.5 2.4 3.7 5.2 6.4 4.1 1-.4 1.5-1.8 1.7-3.3l-1.1-2.4Z" fill="url(#msn-classic-wing-green)"/>
        <path d="M20.75 23c2.6-.7 6.6-.5 7 1.6.5 2.4-3.7 5.2-6.4 4.1-1-.4-1.5-1.8-1.7-3.3l1.1-2.4Z" fill="url(#msn-classic-wing-yellow)"/>
      </g>
      <path d="M19.9 21.3c-.5-1.2-1.5-2-2.7-2.5m2.8 2.5c.5-1.2 1.5-2 2.7-2.5M20 21.1v8.8" stroke="#38516b" stroke-width=".85" stroke-linecap="round"/>
      <path d="M12.6 18.3c1.6 1.4 3.5 2 5.5 2.2m4.4-2.2c-1.6 1.4-3.5 2-5.5 2.2" stroke="#ffffff" stroke-opacity=".6" stroke-width=".5" stroke-linecap="round"/>
    </g>
    <circle cx="20" cy="20" r="19.2" stroke="#cbdde5" stroke-width=".8"/>
  </svg>`;
 async function api(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{return await sourceFetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});}finally{clearTimeout(timer);}}
 function expired(){document.getElementById('jobs')?.replaceChildren();document.querySelector('.account-control')?.remove();location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));}
 async function check(){if(!account||Date.now()-lastCheck<60000)return;lastCheck=Date.now();try{const r=await api('/auth/session');if(r.status===401){expired();return;}if(!r.ok)return;const latest=await r.json();if(latest.user?.id!==account.user.id){location.reload();return;}account.csrf=latest.csrf;if(window.AccountPreferences)window.AccountPreferences.user.csrf=latest.csrf;}catch{}}
 function install(data){account=data;
  window.fetch=async function(input,options){const response=await sourceFetch(input,options);try{const url=new URL(input instanceof Request?input.url:String(input),location.href);if(url.origin===location.origin&&response.status===401)expired();}catch{}return response;};
  const broadcast=typeof BroadcastChannel==='function'?new BroadcastChannel('lj-account'):null;
  broadcast?.addEventListener('message',e=>{if(e.data?.type==='logout')expired();if(e.data?.type==='identity'&&e.data.id!==account.user.id)location.reload();});broadcast?.postMessage({type:'identity',id:data.user.id});
  addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});addEventListener('pageshow',e=>{if(e.persisted){lastCheck=0;check();}});
  const control=document.createElement('div');control.className='account-control';
  control.innerHTML='<button type="button" class="account-trigger" aria-expanded="false" aria-controls="accountPanel" aria-label="账号设置">'+ACCOUNT_MARK+'<span class="account-name"></span><svg class="account-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m5 6 3 3 3-3" stroke="currentColor" stroke-linecap="round"/></svg></button><div class="account-panel" id="accountPanel" hidden><p class="account-caption">YOUR ACCOUNT</p><strong class="account-user"></strong><p class="account-status" role="status" aria-live="polite">正在准备账号同步…</p><p class="account-summary">收藏、屏蔽机构、屏蔽词与已读状态随账号同步</p><button type="button" class="account-sync-now">立即同步</button><button type="button" class="account-logout">退出登录</button></div>';
  const trigger=control.querySelector('.account-trigger'),panel=control.querySelector('.account-panel'),name=data.user.name||'我的账号',status=control.querySelector('.account-status');control.querySelector('.account-name').textContent=name;control.querySelector('.account-user').textContent=name;trigger.title=name;trigger.setAttribute('aria-label',name+' · Account settings');
  const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');};trigger.onclick=()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));};
  control.querySelector('.account-logout').onclick=async e=>{e.target.disabled=true;try{if(!await window.AccountPreferences.flush()&&window.AccountPreferences.pending().length){status.textContent='尚有更改未同步，请恢复网络后再退出';e.target.disabled=false;return;}const r=await api('/auth/logout',{method:'POST',headers:{'x-csrf-token':account.csrf}});if(!r.ok)throw Error();window.AccountPreferences.stop();try{indexedDB.deleteDatabase('linkedin-job-index');}catch{}broadcast?.postMessage({type:'logout'});expired();}catch{status.textContent='退出失败，请检查网络后重试';e.target.disabled=false;}};
  const host=document.querySelector('.shell')||document.body;host.classList.add('account-host');let utility=host.querySelector('.header-utility');if(!utility){utility=document.createElement('div');utility.className='header-utility';const theme=host.querySelector('#themeToggle');host.append(utility);if(theme)utility.append(theme);}utility.append(control);const measureTools=()=>host.style.setProperty('--header-tools-width',utility.getBoundingClientRect().width+'px');measureTools();if(typeof ResizeObserver==='function')new ResizeObserver(measureTools).observe(utility);window.AccountPreferences=window.createAccountPreferences({user:{id:data.user.id,csrf:data.csrf},api,status:text=>{status.textContent=text;control.dataset.sync=text==='已同步至账号'?'ready':text.includes('暂未')?'pending':'syncing';},expired});control.querySelector('.account-sync-now').onclick=()=>window.AccountPreferences.flush();document.addEventListener('click',e=>{if(!control.contains(e.target))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const wasOpen=!panel.hidden;close();if(wasOpen)trigger.focus();}});
 }
 async function boot(){const r=await api('/auth/session');if(r.status===401&&document.documentElement.dataset.authState==='guest'){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/auth-guest.js?v=2';script.onload=resolve;script.onerror=reject;document.body.append(script);});window.AuthGuest.install();}else if(r.status===401){expired();return;}if(!r.ok&&r.status!==401)throw Error();const data=r.ok?await r.json():{enabled:false};if(data.enabled){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/account-sync.js?v=sync-1';script.onload=resolve;script.onerror=reject;document.body.append(script);});install(data);}const sources=JSON.parse(document.getElementById('appScripts').textContent);await Promise.all(sources.map(src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.async=false;script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);})));window.AccountPreferences?.schedule(0);}
 boot().catch(()=>{const jobs=document.getElementById('jobs');if(jobs){jobs.replaceChildren();const p=document.createElement('p');p.textContent='账号或页面加载失败，请检查网络后重试。';const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>location.reload();jobs.append(p,retry);}});
})();

