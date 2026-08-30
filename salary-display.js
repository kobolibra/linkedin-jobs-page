/* Remove inferred job levels and display optional WIP salary in responsive positions. */
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
    .salary-ref-mobile{display:none}
    body.compact .salary-ref{
      min-height:15px;
      padding:0 6px;
      font-size:8.7px;
    }

    @media(max-width:720px){
      /* Preserve the original title/company wrapping; only split the company row into left and right. */
      .job-sub{
        display:flex;
        align-items:baseline;
        gap:8px;
        white-space:normal;
        overflow:visible;
        text-overflow:clip;
      }
      .job-company-text{
        flex:1 1 auto;
        min-width:0;
        white-space:normal;
        overflow-wrap:break-word;
      }
      .salary-ref-desktop{display:none}
      .salary-ref-mobile{
        display:inline-flex;
        flex:0 0 auto;
        align-self:baseline;
        margin-left:0;
        min-width:0;
        min-height:15px;
        padding:0 6px;
        border-radius:4px;
        font-size:8.8px;
      }
      body.compact .job-sub{white-space:normal;overflow:visible;text-overflow:clip}
      body.compact .job-company-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.compact .salary-ref-mobile{min-height:14px;padding:0 5px;font-size:8.5px}
    }
  `;
  document.head.appendChild(style);

  let salaryById=new Map();

  const ensureCompanyText=article=>{
    const sub=article.querySelector('.job-sub');
    if(!sub)return null;
    let companyText=sub.querySelector(':scope > .job-company-text');
    if(!companyText){
      companyText=document.createElement('span');
      companyText.className='job-company-text';
      const nodes=[...sub.childNodes].filter(node=>!(node.nodeType===1&&node.classList.contains('salary-ref-mobile')));
      nodes.forEach(node=>companyText.appendChild(node));
      sub.prepend(companyText);
    }
    return {sub,companyText};
  };

  const decorate=article=>{
    const right=article.querySelector('.job-right');
    const company=ensureCompanyText(article);
    const detail=article.querySelector('.job-detail-line');
    if(!right||!company)return;

    /* Level remains removed everywhere. */
    right.querySelectorAll(':scope > .lvl').forEach(node=>node.remove());

    const link=article.querySelector('.job-title')?.href||'';
    const id=article.dataset.id||jobId(link);
    const salary=salaryById.get(id)||salaryById.get(jobId(link));
    let desktopBadge=article.querySelector('.salary-ref-desktop');
    let mobileBadge=article.querySelector('.salary-ref-mobile');

    if(!salary){
      desktopBadge?.remove();
      mobileBadge?.remove();
      return;
    }

    if(!desktopBadge){
      desktopBadge=document.createElement('span');
      desktopBadge.className='salary-ref salary-ref-desktop';
      const age=right.querySelector(':scope > .age');
      const region=right.querySelector(':scope > .tag');
      right.insertBefore(desktopBadge,age||region||right.firstChild);
    }
    if(!mobileBadge){
      mobileBadge=document.createElement('span');
      mobileBadge.className='salary-ref salary-ref-mobile';
      (detail||company.sub).appendChild(mobileBadge);
    }

    desktopBadge.textContent=salary;
    mobileBadge.textContent=salary;
    desktopBadge.setAttribute('aria-label',`薪资 ${salary}`);
    mobileBadge.setAttribute('aria-label',`薪资 ${salary}`);
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
