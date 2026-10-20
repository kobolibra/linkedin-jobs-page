/* One Google entry for registration and sign-in; never handles provider secrets. */
(()=>{
 const card=document.getElementById('signIn'),message=document.getElementById('authMessage'),retry=document.getElementById('authRetry'),google=document.getElementById('googleLogin'),label=google.querySelector('.auth-provider-label'),existing=document.getElementById('authExisting'),resume=document.getElementById('continueBrowsing');
 const params=new URLSearchParams(location.search);
 if(params.has('error')){try{sessionStorage.removeItem('finance-preview-intent');}catch{}}
 const safeNext=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\u0000-\u001f\u007f]/.test(value)&&!/^\/(?:auth(?:\/|$)|login)/i.test(value)?value.slice(0,1000):'/';
 const next=safeNext(params.get('next'));google.href='/auth/start/google?next='+encodeURIComponent(next);resume.href=next;
 const errors={session_expired:'Your session has expired. Sign in to continue.',invalid_state:'This sign-in could not be verified. Please try again.',expired_login:'This sign-in has timed out. Please try again.',cancelled:'Sign-in was cancelled. You can try again when you are ready.',login_failed:'We could not complete sign-in. Please try again.',link_expired:'Your session has expired. Please sign in again.'};
 let available=false,loading=false,leaving=false,watchdog;
 function state(name,text){card.dataset.state=name;message.textContent=text;google.setAttribute('aria-disabled',String(!available||leaving));google.setAttribute('aria-busy',String(name==='redirecting'));label.textContent=name==='redirecting'?'Opening Google…':existing.hidden?'Continue with Google':'Use another Google account';}
 async function read(path){const control=new AbortController(),timer=setTimeout(()=>control.abort(),10000);try{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:control.signal});return {response:r,data:r.ok?await r.json():null};}finally{clearTimeout(timer);}}
 async function load(){if(loading)return;loading=true;existing.hidden=true;resume.hidden=true;document.getElementById('signInTitle').textContent='Sign in';document.getElementById('authIntro').innerHTML='New here? Signing in creates your account.';retry.hidden=true;available=false;state('loading','Preparing sign-in…');
  try{
   const {response,data}=await read('/auth/providers');if(!response.ok)throw Error('network');if(!data.enabled){location.replace(next);return;}
   available=Array.isArray(data.providers)&&data.providers.includes('google');
   if(!available){state('unavailable','Sign-in is temporarily unavailable. Please try again later.');retry.hidden=false;return;}
   state(params.has('error')?'error':'ready',errors[params.get('error')]||(params.has('signed_out')?'You have signed out. Your account records are saved.':''));
   // An existing session is a shortcut, never a prerequisite for signing in.
   try{const current=await read('/auth/session');if(!leaving&&current.response.ok&&current.data?.user){existing.hidden=false;resume.hidden=false;document.getElementById('authExistingName').textContent='Signed in as '+(current.data.user.name||'your account');document.getElementById('signInTitle').textContent='Welcome back';document.getElementById('authIntro').textContent='You are already signed in.';label.textContent='Use another Google account';}}catch{}
  }catch{state('error','Unable to reach sign-in. Check your connection and try again.');retry.hidden=false;}finally{loading=false;}
 }
 google.addEventListener('click',event=>{if(!available||leaving){event.preventDefault();return;}leaving=true;retry.hidden=true;state('redirecting','Opening Google. You will return here after signing in.');watchdog=setTimeout(()=>{leaving=false;state('error','Not redirected? Please try again.');retry.hidden=false;},15000);});
 retry.addEventListener('click',()=>{clearTimeout(watchdog);leaving=false;load();});
 addEventListener('pageshow',event=>{if(event.persisted){clearTimeout(watchdog);leaving=false;state(available?'ready':'error',available?'':'Please try connecting again.');if(!available)retry.hidden=false;}});
 load();
})();

