/* One Google entry for registration and sign-in; never handles provider secrets. */
(()=>{
 const card=document.getElementById('signIn'),message=document.getElementById('authMessage'),retry=document.getElementById('authRetry'),google=document.getElementById('googleLogin'),label=google.querySelector('.auth-provider-label'),existing=document.getElementById('authExisting'),resume=document.getElementById('continueBrowsing');
 const params=new URLSearchParams(location.search);
 const safeNext=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\u0000-\u001f\u007f]/.test(value)&&!/^\/(?:auth(?:\/|$)|login)/i.test(value)?value.slice(0,1000):'/';
 const next=safeNext(params.get('next'));google.href='/auth/start/google?next='+encodeURIComponent(next);resume.href=next;
 const errors={session_expired:'登录状态已过期，重新登录即可接续记录。',invalid_state:'这次登录验证未通过，请重新尝试。',expired_login:'登录已超时，请重新尝试。',cancelled:'你已取消登录，准备好后可以继续。',login_failed:'暂时未能完成登录，请重新尝试。',link_expired:'登录状态已过期，请重新登录。'};
 let available=false,loading=false,leaving=false,watchdog;
 function state(name,text){card.dataset.state=name;message.textContent=text;google.setAttribute('aria-disabled',String(!available||leaving));google.setAttribute('aria-busy',String(name==='redirecting'));label.textContent=name==='redirecting'?'正在前往 Google…':existing.hidden?'使用 Google 继续':'切换 Google 账号';}
 async function read(path){const control=new AbortController(),timer=setTimeout(()=>control.abort(),10000);try{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:control.signal});return {response:r,data:r.ok?await r.json():null};}finally{clearTimeout(timer);}}
 async function load(){if(loading)return;loading=true;existing.hidden=true;resume.hidden=true;document.getElementById('signInTitle').textContent='欢迎来到你的职位空间';document.getElementById('authIntro').innerHTML='登录与注册，一个入口。<br>首次使用 Google 登录，即可创建账号。';retry.hidden=true;available=false;state('loading','正在准备安全登录…');
  try{
   const {response,data}=await read('/auth/providers');if(!response.ok)throw Error('network');if(!data.enabled){location.replace(next);return;}
   available=Array.isArray(data.providers)&&data.providers.includes('google');
   if(!available){state('unavailable','登录服务暂不可用，请稍后再试。');retry.hidden=false;return;}
   state(params.has('error')?'error':'ready',errors[params.get('error')]||(params.has('signed_out')?'已安全退出，账号中的记录已保留。':''));
   // An existing session is a shortcut, never a prerequisite for signing in.
   try{const current=await read('/auth/session');if(!leaving&&current.response.ok&&current.data?.user){existing.hidden=false;resume.hidden=false;document.getElementById('authExistingName').textContent='已登录为 '+(current.data.user.name||'当前账号');document.getElementById('signInTitle').textContent='欢迎回来';document.getElementById('authIntro').textContent='你的职位记录已就绪，继续上次的探索。';label.textContent='切换 Google 账号';}}catch{}
  }catch{state('error','暂时无法连接登录服务，请检查网络后重试。');retry.hidden=false;}finally{loading=false;}
 }
 google.addEventListener('click',event=>{if(!available||leaving){event.preventDefault();return;}leaving=true;retry.hidden=true;state('redirecting','即将打开 Google，完成后会自动返回。');watchdog=setTimeout(()=>{leaving=false;state('error','尚未跳转？请重新尝试，或检查浏览器是否阻止了跳转。');retry.hidden=false;},15000);});
 retry.addEventListener('click',()=>{clearTimeout(watchdog);leaving=false;load();});
 addEventListener('pageshow',event=>{if(event.persisted){clearTimeout(watchdog);leaving=false;state(available?'ready':'error',available?'':'请重新尝试连接登录服务。');if(!available)retry.hidden=false;}});
 load();
})();
