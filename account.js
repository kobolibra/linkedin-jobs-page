/* Authenticate and prepare account-scoped preferences before loading the app. */
(()=>{
 const sourceFetch=window.fetch.bind(window);let account=null,lastCheck=0;
 const ACCOUNT_MARK=`
  <svg class="account-mark" aria-hidden="true" viewBox="0 0 40 40" fill="none">
    <defs>
      <radialGradient id="msn-blue-ground" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 7) rotate(54) scale(42)"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#d9e9f1"/></radialGradient>
      <linearGradient id="msn-blue-buddy" x1="10" y1="4" x2="29" y2="37" gradientUnits="userSpaceOnUse"><stop stop-color="#e4fcff"/><stop offset=".12" stop-color="#a7f0ff"/><stop offset=".31" stop-color="#5dc9f4"/><stop offset=".57" stop-color="#268fdd"/><stop offset=".82" stop-color="#1768bd"/><stop offset="1" stop-color="#123e88"/></linearGradient>
      <linearGradient id="msn-blue-lower-shade" x1="20" y1="20" x2="20" y2="37" gradientUnits="userSpaceOnUse"><stop stop-color="#082f70" stop-opacity="0"/><stop offset="1" stop-color="#082f70" stop-opacity=".32"/></linearGradient>
      <linearGradient id="msn-blue-highlight" x1="12" y1="7" x2="28" y2="29" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff" stop-opacity=".8"/><stop offset="1" stop-color="#d8f8ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="msn-blue-rim" x1="8" y1="7" x2="32" y2="34" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff" stop-opacity=".95"/><stop offset=".48" stop-color="#d6f7ff" stop-opacity=".55"/><stop offset="1" stop-color="#8dbfe9" stop-opacity=".9"/></linearGradient>
      <clipPath id="msn-blue-crop"><circle cx="20" cy="20" r="19"/></clipPath>
      <clipPath id="msn-blue-shape"><path d="M20 4.7c-4.8 0-8 3.3-8 7.9 0 3.1 1.4 5.6 3.8 6.8-5.7 1.1-9.4 5.8-10.2 12.2l-.3 2.1c-.2 1.5 1 2.7 2.5 2.7h24.4c1.5 0 2.7-1.2 2.5-2.7l-.3-2.1c-.8-6.4-4.5-11.1-10.2-12.2 2.4-1.2 3.8-3.7 3.8-6.8 0-4.6-3.2-7.9-8-7.9Z"/></clipPath>
    </defs>
    <circle cx="20" cy="20" r="19.2" fill="url(#msn-blue-ground)" stroke="#cbdde6" stroke-width=".8"/>
    <circle cx="20" cy="20" r="17.8" stroke="#ffffff" stroke-opacity=".62" stroke-width=".55"/>
    <g clip-path="url(#msn-blue-crop)">
      <ellipse cx="20" cy="36.7" rx="12.5" ry="1.2" fill="#164980" fill-opacity=".18"/>
      <path d="M20 4.7c-4.8 0-8 3.3-8 7.9 0 3.1 1.4 5.6 3.8 6.8-5.7 1.1-9.4 5.8-10.2 12.2l-.3 2.1c-.2 1.5 1 2.7 2.5 2.7h24.4c1.5 0 2.7-1.2 2.5-2.7l-.3-2.1c-.8-6.4-4.5-11.1-10.2-12.2 2.4-1.2 3.8-3.7 3.8-6.8 0-4.6-3.2-7.9-8-7.9Z" transform="translate(.15 .75)" fill="#0f478c" fill-opacity=".28"/>
      <path d="M20 4.7c-4.8 0-8 3.3-8 7.9 0 3.1 1.4 5.6 3.8 6.8-5.7 1.1-9.4 5.8-10.2 12.2l-.3 2.1c-.2 1.5 1 2.7 2.5 2.7h24.4c1.5 0 2.7-1.2 2.5-2.7l-.3-2.1c-.8-6.4-4.5-11.1-10.2-12.2 2.4-1.2 3.8-3.7 3.8-6.8 0-4.6-3.2-7.9-8-7.9Z" fill="url(#msn-blue-buddy)" stroke="url(#msn-blue-rim)" stroke-width=".9" stroke-linejoin="round"/>
      <g clip-path="url(#msn-blue-shape)">
        <path d="M8 4h24v18c-3.4 2.2-7.4 3-12 3-4.4 0-8.4-1.1-12-3V4Z" fill="url(#msn-blue-highlight)"/>
        <path d="M7 21h26v17H7z" fill="url(#msn-blue-lower-shade)"/>
        <ellipse cx="16.2" cy="8.9" rx="3.6" ry="1.15" transform="rotate(-17 16.2 8.9)" fill="#ffffff" fill-opacity=".54"/>
        <path d="M13.7 10c1-1.8 2.9-2.8 5.4-2.8 2.2 0 4 .9 5.1 2.5" stroke="#ffffff" stroke-opacity=".9" stroke-width="1.05" stroke-linecap="round"/>
        <path d="M8.2 31.4c.9-5.1 3.1-8.3 7-9.9m9.6-.1c3.8 1.5 6.1 4.8 7 9.7" stroke="url(#msn-blue-highlight)" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M12.3 24.1c2.2-1.6 4.7-2.4 7.7-2.4" stroke="#ffffff" stroke-opacity=".42" stroke-width=".65" stroke-linecap="round"/>
        <path d="M11.3 34.3c3.4 1.5 14 1.6 17.4 0" stroke="#c8f5ff" stroke-opacity=".72" stroke-width=".65" stroke-linecap="round"/>
      </g>
    </g>
    <circle cx="20" cy="20" r="19.2" stroke="#cbdde6" stroke-width=".8"/>
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

