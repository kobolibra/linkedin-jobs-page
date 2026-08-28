/* Remove inferred job levels and display optional WIP salary first in the existing metadata rail. */
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
    .salary-ref{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:17px;
      padding:0 7px;
      border-radius:5px;
      font-family:var(--mono);
      font-size:9.5px;
      font-weight:700;
      letter-spacing:.015em;
      white-space:nowrap;
      color:var(--gold-deep);
      background:color-mix(in srgb,var(--gold) 9%,transparent);
      box-shadow:none;
    }
    [data-theme="dark"] .salary-ref{
      color:var(--gold-hi);
      background:color-mix(in srgb,var(--gold) 10%,transparent);
    }
    body.compact .salary-ref{
      min-height:15px;
      padding:0 6px;
      font-size:8.7px;
    }
    @media(max-width:720px){
      .salary-ref{
        min-width:0;
        min-height:15px;
        padding:0 6px;
        border-radius:4px;
        font-size:8.8px;
      }
    }
  `;
  document.head.appendChild(style);

  let salaryById=new Map();

  const decorate=article=>{
    const right=article.querySelector('.job-right');
    if(!right)return;

    /* Level is intentionally removed on every viewport. */
    right.querySelectorAll('.lvl').forEach(node=>node.remove());
    article.querySelectorAll('.job-meta-inline').forEach(node=>node.remove());

    const link=article.querySelector('.job-title')?.href||'';
    const id=article.dataset.id||jobId(link);
    const salary=salaryById.get(id)||salaryById.get(jobId(link));
    let badge=article.querySelector('.salary-ref');

    if(!salary){
      badge?.remove();
      return;
    }

    if(!badge){
      badge=document.createElement('span');
      badge.className='salary-ref';
    }

    badge.textContent=salary;
    badge.setAttribute('aria-label',`薪资 ${salary}`);

    /* Required order: salary → posting age → region → actions. */
    const age=right.querySelector(':scope > .age');
    const region=right.querySelector(':scope > .tag');
    right.insertBefore(badge,age||region||right.firstChild);
  };

  const decorateAll=()=>host.querySelectorAll('.job').forEach(decorate);

  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const added of mutation.addedNodes){
        if(added.nodeType!==1)continue;
        if(added.matches?.('.job'))decorate(added);
        added.querySelectorAll?.('.job').forEach(decorate);
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
    .catch(()=>{decorateAll();});
})();
