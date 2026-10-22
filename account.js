/* Authenticate and prepare account-scoped preferences before loading the app. */
(()=>{
 const sourceFetch=window.fetch.bind(window);let account=null,lastCheck=0;
 const ACCOUNT_MARK=`
  <svg class="account-mark" aria-hidden="true" viewBox="0 0 40 40" fill="none">
    <defs>
      <radialGradient id="account-avatar-ground" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13 10) rotate(55) scale(30)"><stop stop-color="#f8fbfc"/><stop offset="1" stop-color="#dce8ee"/></radialGradient>
      <linearGradient id="account-avatar-face" x1="15" y1="8" x2="25" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#f4d1b2"/><stop offset="1" stop-color="#d99f7c"/></linearGradient>
      <linearGradient id="account-avatar-hair" x1="14" y1="4" x2="26" y2="17" gradientUnits="userSpaceOnUse"><stop stop-color="#394653"/><stop offset="1" stop-color="#182a3a"/></linearGradient>
      <linearGradient id="account-avatar-suit" x1="12" y1="27" x2="29" y2="39" gradientUnits="userSpaceOnUse"><stop stop-color="#294a66"/><stop offset="1" stop-color="#122b42"/></linearGradient>
      <clipPath id="account-avatar-crop"><circle cx="20" cy="20" r="19"/></clipPath>
    </defs>
    <circle cx="20" cy="20" r="19.2" fill="url(#account-avatar-ground)" stroke="#d0dfe6" stroke-width=".8"/>
    <g clip-path="url(#account-avatar-crop)">
      <path d="M3.2 41c.2-8.7 4.8-13.4 12.4-15.2l4.4 3.1 4.4-3.1c7.6 1.8 12.2 6.5 12.4 15.2H3.2Z" fill="url(#account-avatar-suit)"/>
      <path d="m14.8 26 5.2 4.7 5.2-4.7 3 3.3-5.5 8.2h-5.4l-5.5-8.2 3-3.3Z" fill="#f5f4ef"/>
      <path d="m18.2 30.2 1.8 1.3 1.8-1.3 1.1 7.3h-5.8l1.1-7.3Z" fill="#9d794c"/>
      <path d="M16.3 21.5h7.4v7.1c-1.7 1.7-5.7 1.7-7.4 0v-7.1Z" fill="url(#account-avatar-face)"/>
      <ellipse cx="20" cy="14.2" rx="8.2" ry="9.8" fill="url(#account-avatar-hair)"/>
      <path d="M12.8 16.2c-1.1.1-1.8 1-1.7 2 .1 1.2.9 1.9 2 1.9m13.8-3.9c1.1.1 1.8 1 1.7 2-.1 1.2-.9 1.9-2 1.9" fill="url(#account-avatar-face)" stroke="#bf8768" stroke-width=".45"/>
      <ellipse class="avatar-face" cx="20" cy="16.7" rx="6.35" ry="8.6" fill="url(#account-avatar-face)"/>
      <path d="M13.1 16.1c-.8-2.1-.9-4.5-.4-6.6.9-3.6 3.7-5.8 7.2-5.8 4.4 0 7.4 3.2 7.4 7.5 0 1.7-.3 3.3-.9 4.7-.4-1.4-.9-2.7-1.6-3.8-2.4.8-5.5.6-8.1-1.4-.5 2.2-1.7 4.1-3.6 5.4Z" fill="url(#account-avatar-hair)"/>
      <path d="M16.1 16.8c.8-.5 1.6-.5 2.4-.1m3-.1c.8-.4 1.6-.4 2.4.1" stroke="#554238" stroke-width=".7" stroke-linecap="round"/>
      <path d="M17.1 18.2v.1m5.8-.1v.1" stroke="#253746" stroke-width="1.15" stroke-linecap="round"/>
      <path d="m20.7 18.8-.7 2 1 .2m-3.1 1.3c1.2.8 2.8.8 4.1-.1" stroke="#a86557" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m13.3 27.2 6.7 5.1-3.4 4.4-6-7.9 2.7-1.6Zm13.4 0L20 32.3l3.4 4.4 6-7.9-2.7-1.6Z" fill="#355773" stroke="#8da4b4" stroke-opacity=".55" stroke-width=".45"/>
      <path d="M7 35.8c2.2-3.3 4.5-5.2 7.3-6.3m18.7 6.3c-2.2-3.3-4.5-5.2-7.3-6.3" stroke="#708ba0" stroke-opacity=".65" stroke-width=".45"/>
    </g>
    <circle cx="20" cy="20" r="19.2" stroke="#d0dfe6" stroke-width=".8"/>
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

