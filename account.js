/* Authenticate and prepare account-scoped preferences before loading the app. */
(()=>{
 const sourceFetch=window.fetch.bind(window);let account=null,lastCheck=0;
 const ACCOUNT_MARK=`
  <svg class="account-mark" aria-hidden="true" viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="buddy-blue" x1="5" y1="6" x2="13" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#71c9f6"/><stop offset="1" stop-color="#1879c4"/></linearGradient>
      <linearGradient id="buddy-green" x1="19" y1="5" x2="25" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#b4e95e"/><stop offset="1" stop-color="#55a832"/></linearGradient>
      <linearGradient id="buddy-wing-orange" x1="12" y1="12" x2="16" y2="16" gradientUnits="userSpaceOnUse"><stop stop-color="#ff8858"/><stop offset="1" stop-color="#f35325"/></linearGradient>
      <linearGradient id="buddy-wing-blue" x1="16" y1="12" x2="20" y2="16" gradientUnits="userSpaceOnUse"><stop stop-color="#43c9f1"/><stop offset="1" stop-color="#00a4ef"/></linearGradient>
      <linearGradient id="buddy-wing-green" x1="12" y1="16" x2="16" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#a4d958"/><stop offset="1" stop-color="#7fba00"/></linearGradient>
      <linearGradient id="buddy-wing-yellow" x1="16" y1="16" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#ffd45a"/><stop offset="1" stop-color="#ffb900"/></linearGradient>
      <clipPath id="buddy-avatar-clip"><circle cx="16" cy="16" r="15.1"/></clipPath>
    </defs>
    <circle cx="16" cy="16" r="15.15" fill="#f4f8fb" stroke="#d8e4eb" stroke-width=".8"/>
    <g clip-path="url(#buddy-avatar-clip)">
      <path d="M1.8 26.2c.1-5.3 3.5-9.4 8.1-9.4 3.2 0 5.7 1.8 7.1 4.7v4.7H1.8Z" fill="url(#buddy-blue)" stroke="#fff" stroke-width=".75"/>
      <circle cx="9.9" cy="10.2" r="4.1" fill="url(#buddy-blue)" stroke="#fff" stroke-width=".75"/>
      <path d="M15 26.2c.1-5.3 3.5-9.4 8.1-9.4 4.6 0 7 4.1 7.1 9.4H15Z" fill="url(#buddy-green)" stroke="#fff" stroke-width=".75"/>
      <circle cx="22.1" cy="10.2" r="4.1" fill="url(#buddy-green)" stroke="#fff" stroke-width=".75"/>
      <g stroke="#fff" stroke-width=".45" stroke-linejoin="round">
        <path d="M15.55 16.1c-1.2-1.1-2.8-3.4-3.7-2.9-.9.5.1 2.6 1.4 3.5.7.5 1.5.5 2.3.2Z" fill="url(#buddy-wing-orange)"/>
        <path d="M16.45 16.1c1.2-1.1 2.8-3.4 3.7-2.9.9.5-.1 2.6-1.4 3.5-.7.5-1.5.5-2.3.2Z" fill="url(#buddy-wing-blue)"/>
        <path d="M15.55 16.2c-1.2.1-2.7-.2-3.4.6-.7.7.4 2.1 1.5 2.1 1 0 1.6-1.1 2-2.2Z" fill="url(#buddy-wing-green)"/>
        <path d="M16.45 16.2c1.2.1 2.7-.2 3.4.6.7.7-.4 2.1-1.5 2.1-1 0-1.6-1.1-2-2.2Z" fill="url(#buddy-wing-yellow)"/>
      </g>
      <path d="M16 15.2c-.3-.8-.8-1.3-1.5-1.8m1.5 1.8c.3-.8.8-1.3 1.5-1.8m-1.5 1.7v4" stroke="#38596a" stroke-width=".55" stroke-linecap="round"/>
    </g>
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

