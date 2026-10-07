(()=>{
  const el=document.getElementById('busuanzi_value_site_pv');
  if(!el)return;
  let state='idle',attempt=0;
  function load(){
    if(state==='loading'||state==='ready')return;
    state='loading';
    const current=++attempt,callback='BusuanziCallback_Live_'+current;
    el.textContent='…';
    el.setAttribute('aria-label','访问数加载中');
    el.setAttribute('aria-busy','true');
    el.title='';
    const script=document.createElement('script');
    const pending=()=>current===attempt&&state==='loading';
    const cleanup=()=>{window[callback]=()=>{};script.remove();};
    const failed=()=>{
      if(!pending())return;
      state='error';cleanup();
      el.setAttribute('aria-busy','false');
      el.setAttribute('aria-label','访问数未加载，点击重试');
      const retry=document.createElement('button');
      retry.type='button';retry.textContent='重试';
      retry.setAttribute('aria-label','重新加载访问数');
      retry.title='访问数请求未完成，点击重新加载';
      retry.style.cssText='font:inherit;font-size:14px;line-height:1.4;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px';
      retry.addEventListener('click',load);
      el.replaceChildren(retry);
    };
    window[callback]=data=>{
      if(!pending())return;
      const value=data?.site_pv;
      if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value.trim()))){failed();return;}
      const n=Number(value);
      if(!Number.isSafeInteger(n)||n<0){failed();return;}
      state='ready';cleanup();
      el.textContent=n.toLocaleString('en-US');
      el.setAttribute('aria-label','访问数 '+n.toLocaleString('zh-CN'));
      el.setAttribute('aria-busy','false');
      el.title='';
    };
    // A slow request is still pending, not evidence that the service is down.
    // Only a terminal network error or invalid response enables explicit retry.
    // No timeout retry: repeating a counting request can inflate the original PV.
    script.async=true;
    script.referrerPolicy='origin';
    script.src='https://busuanzi.ibruce.info/busuanzi?jsonpCallback='+callback;
    script.onerror=failed;
    script.onload=failed; // Valid JSONP already changed state to ready.
    document.head.appendChild(script);
  }
  load();
})();
