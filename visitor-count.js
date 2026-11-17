(()=>{
  const el=document.getElementById('busuanzi_value_site_pv');
  if(!el)return;
  let state='idle',attempt=0,last=null;
  const cacheKey='next-journey:busuanzi:last-success';
  try{
    const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');
    if(saved&&Number.isSafeInteger(saved.value)&&saved.value>=0&&Number.isFinite(saved.at)&&saved.at>0&&saved.at<=Date.now())last=saved;
  }catch{}
  function fallback(){
    el.textContent=last?last.value.toLocaleString('en-US'):'—';
    const note=last?'上次成功更新：'+window.JobDates.formatStamp(last.at)+'；统计服务暂不可用':'统计服务暂不可用，尚未取得访问总数';
    el.title=note;
    el.setAttribute('aria-label',last?'访问数 '+last.value.toLocaleString('zh-CN')+'；'+note:note);
    el.setAttribute('aria-busy','false');
  }
  function load(){
    if(state==='loading'||state==='ready')return;
    state='loading';
    const current=++attempt,callback='BusuanziCallback_Live_'+current;
    el.textContent=last?last.value.toLocaleString('en-US'):'…';
    el.setAttribute('aria-label','访问数加载中');
    el.setAttribute('aria-busy','true');
    el.title='';
    const script=document.createElement('script');
    const pending=()=>current===attempt&&state==='loading';
    // Stop the loading indicator without retrying or duplicating a counted visit.
    // Keep the callback alive so a late successful response can still update the total.
    const timer=setTimeout(()=>{if(pending())fallback();},10000);
    const cleanup=()=>{clearTimeout(timer);window[callback]=()=>{};script.remove();};
    const failed=()=>{
      if(!pending())return;
      state='error';cleanup();
      fallback();
    };
    window[callback]=data=>{
      if(!pending())return;
      const value=data?.site_pv;
      if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value.trim()))){failed();return;}
      const n=Number(value);
      if(!Number.isSafeInteger(n)||n<0){failed();return;}
      state='ready';cleanup();
      last={value:n,at:Date.now()};
      try{localStorage.setItem(cacheKey,JSON.stringify(last));}catch{}
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
