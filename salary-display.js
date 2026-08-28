/* Display WIP salary references enriched into jobs.json by n8n. */
(()=>{
  const host=document.getElementById('jobs');
  if(!host)return;

  const jobId=link=>{
    if(!link)return'';
    const text=String(link);
    const path=text.split(/[?#]/)[0];
    const match=path.match(/(\d{5,})\/?$/)||text.match(/[?&]currentJobId=(\d+)/);
    return match?`ln:${match[1]}`:path.replace(/\/+$/,'');
  };

  const style=document.createElement('style');
  style.textContent=`
    .salary-ref{display:inline-flex;align-items:center;justify-content:center;min-height:17px;padding:0 7px;border-radius:999px;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.02em;white-space:nowrap;color:var(--gold-deep);background:var(--accent-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 24%,transparent)}
    [data-theme="dark"] .salary-ref{color:var(--gold-hi);background:color-mix(in srgb,var(--gold) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 30%,transparent)}
    body.compact .salary-ref{min-height:15px;padding:0 6px;font-size:8.8px}
    @media(max-width:720px){.salary-ref{min-width:0;font-size:9px}}
  `;
  document.head.appendChild(style);

  let salaryById=new Map();
  const decorate=article=>{
    const link=article.querySelector('.job-title')?.href||'';
    const id=article.dataset.id||jobId(link);
    const salary=salaryById.get(id)||salaryById.get(jobId(link));
    let badge=article.querySelector('.salary-ref');
    if(!salary){badge?.remove();return;}
    if(!badge){
      badge=document.createElement('span');
      badge.className='salary-ref';
      badge.title='参考薪资（来源：WIP）';
      const right=article.querySelector('.job-right');
      if(!right)return;
      right.insertBefore(badge,right.firstChild);
    }
    badge.textContent=salary;
    badge.setAttribute('aria-label',`参考薪资 ${salary}`);
  };
  const decorateAll=()=>host.querySelectorAll('.job').forEach(decorate);

  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches?.('.job'))decorate(node);
        node.querySelectorAll?.('.job').forEach(decorate);
      }
    }
  }).observe(host,{childList:true,subtree:true});

  fetch('jobs.json',{cache:'no-cache'})
    .then(response=>{if(!response.ok)throw new Error(`jobs.json HTTP ${response.status}`);return response.json();})
    .then(rows=>{
      salaryById=new Map();
      if(Array.isArray(rows)){
        for(const row of rows){
          const salary=String(row?.salary??'').trim();
          const id=jobId(row?.link);
          if(id&&salary)salaryById.set(id,salary);
        }
      }
      decorateAll();
    })
    .catch(()=>{});
})();
