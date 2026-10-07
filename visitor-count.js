(()=>{
  const el=document.getElementById('busuanzi_value_site_pv');
  if(!el)return;
  let received=false;
  const unavailable=()=>{
    if(received)return;
    el.textContent='暂不可用';
    el.setAttribute('aria-label','访问统计暂不可用');
    el.title='统计服务暂不可用，请刷新页面重试';
  };
  const timer=setTimeout(unavailable,8000);
  window.BusuanziCallback_Live=data=>{
    const value=data?.site_pv;
    if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value.trim()))){unavailable();return;}
    const n=Number(value);
    if(!Number.isSafeInteger(n)||n<0){unavailable();return;}
    received=true;
    clearTimeout(timer);
    el.textContent=n.toLocaleString('en-US');
    el.setAttribute('aria-label','访问数 '+n.toLocaleString('zh-CN'));
    el.title='';
  };
  // Start immediately: unrelated images/fonts must not delay the visit metric.
  // Exactly one request per page preserves the provider's original PV semantics.
  const script=document.createElement('script');
  script.async=true;
  script.referrerPolicy='origin';
  script.src='https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback_Live';
  script.onerror=()=>{clearTimeout(timer);unavailable();};
  script.onload=()=>{clearTimeout(timer);unavailable();};
  document.head.appendChild(script);
})();
