(()=>{
  const el=document.getElementById('busuanzi_value_site_pv');
  if(!el)return;
  // One ID per page view makes a lost response safe to retry without counting twice.
  const visitId=crypto.randomUUID();
  const endpoint=location.hostname==='kobolibra.github.io'?'https://linkedin.claudecowork.workers.dev/api/visits':'/api/visits';
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  (async()=>{
    for(let attempt=0;attempt<3;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),4000);
      try{
        const response=await fetch(endpoint,{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({visitId}),cache:'no-store',signal:controller.signal,
        });
        if(!response.ok)throw new Error('live_counter_unavailable');
        const data=await response.json();
        if(data?.source!=='first-party-live'||!Number.isSafeInteger(data.site_pv)||data.site_pv<0||!Number.isFinite(Date.parse(data.startedAt)))throw new Error('invalid_live_counter');
        el.textContent=data.site_pv.toLocaleString('en-US');
        el.setAttribute('aria-label','访问数 '+data.site_pv.toLocaleString('zh-CN'));
        el.title='本站实时统计，自 '+new Date(data.startedAt).toLocaleString('zh-CN')+' 起累计（不含旧服务历史数据）';
        return;
      }catch{}finally{clearTimeout(timer);}
      if(attempt<2)await pause(attempt===0?500:1500);
    }
    el.textContent='暂不可用';
    el.setAttribute('aria-label','实时访问统计暂不可用');
    el.title='实时统计暂不可用，请刷新页面重试';
  })();
})();
