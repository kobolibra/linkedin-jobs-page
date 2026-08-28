/* Arrange optional WIP salary and inferred level metadata without destabilizing the action rail. */
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
    /* Desktop: keep posting age in its original right-side position and stabilize the action rail. */
    .job-right{grid-template-columns:44px auto 26px 26px;grid-auto-flow:column;align-items:center;gap:var(--s2)}
    .job-right>.age{grid-column:1}
    .job-right>.tag{grid-column:2}
    .job-right>.star{grid-column:3}
    .job-right>.ban{grid-column:4}

    /* Desktop optional metadata flows beside the company without creating empty columns. */
    .job-sub{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.45}
    .job-company-link{display:inline;white-space:nowrap}
    .job-meta-inline{display:inline-flex;align-items:center;flex-wrap:wrap;gap:7px;margin-left:7px;vertical-align:baseline}
    .job-meta-inline .lvl{min-width:0;text-align:left;line-height:1.25;font-size:9.5px;font-weight:650;letter-spacing:.085em;color:var(--ink-faint)}
    .job-meta-inline .lvl::before{content:'·';margin-right:7px;color:var(--ink-faint);font-family:var(--sans);font-weight:400;letter-spacing:0}

    .salary-ref{display:inline-flex;align-items:center;justify-content:center;min-height:16px;padding:0 6px;border-radius:5px;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.015em;white-space:nowrap;color:var(--gold-deep);background:color-mix(in srgb,var(--gold) 9%,transparent);box-shadow:none}
    [data-theme="dark"] .salary-ref{color:var(--gold-hi);background:color-mix(in srgb,var(--gold) 10%,transparent)}
    .salary-ref-mobile{display:none}

    @media(min-width:721px){
      .job-right .icon-btn{opacity:.42}
      .job:hover .job-right .icon-btn,.job-right .icon-btn:focus-visible,.job-right .star.on{opacity:1}
    }

    body.compact .job-right{gap:var(--s2)}
    body.compact .job-meta-inline{gap:5px;margin-left:5px}
    body.compact .job-meta-inline .lvl{font-size:8.8px}
    body.compact .job-meta-inline .lvl::before{margin-right:5px}
    body.compact .salary-ref{min-height:14px;padding:0 5px;font-size:8.7px}

    /* Mobile: restore the original wrapping and row behavior exactly.
       The only information change is salary taking the former level slot. */
    @media(max-width:720px){
      .job{
        grid-template-columns:38px 1fr;
        grid-template-rows:none;
        gap:var(--s3);
        padding:12px 0;
        align-items:center;
      }
      .job .mono{grid-column:auto;grid-row:auto;align-self:auto}
      .job-main{display:block;min-width:0}
      .job-title{
        display:inline;
        white-space:normal;
        overflow:visible;
        text-overflow:clip;
        line-height:1.3;
      }
      .job-sub{
        display:block;
        grid-column:auto;
        grid-row:auto;
        min-width:0;
        margin-top:3px;
        white-space:normal;
        overflow:visible;
        text-overflow:clip;
        line-height:normal;
      }
      .job-company-link{white-space:normal}
      .job-meta-inline{display:none}
      .salary-ref-desktop{display:none}
      .salary-ref-mobile{
        display:inline-flex;
        min-width:0;
        min-height:15px;
        padding:0 6px;
        border-radius:4px;
        font-size:8.8px;
      }
      .job-right{
        grid-column:2;
        grid-row:auto;
        grid-template-columns:none;
        grid-auto-columns:max-content;
        grid-auto-flow:column;
        justify-content:start;
        align-items:center;
        margin-top:5px;
        gap:var(--s3);
      }
      .job-right>.age,.job-right>.tag,.job-right>.star,.job-right>.ban,.job-right>.salary-ref-mobile{grid-column:auto}
      .job-right>.age{min-width:0;text-align:left}

      body.compact .job{
        grid-template-columns:30px 1fr;
        gap:var(--s2);
        padding:5px 0;
      }
      body.compact .job .mono{grid-column:auto;grid-row:auto;align-self:start;margin-top:1px}
      body.compact .job-title{display:inline;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25}
      body.compact .job-sub{margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.compact .job-right{grid-column:2;grid-row:auto;margin-top:1px;gap:var(--s2);grid-template-columns:none;grid-auto-columns:max-content}
      body.compact .salary-ref-mobile{min-height:14px;padding:0 5px;font-size:8.5px}
    }
  `;
  document.head.appendChild(style);

  let salaryById=new Map();

  const arrangeRow=article=>{
    const sub=article.querySelector('.job-sub');
    const right=article.querySelector('.job-right');
    if(!sub||!right)return null;

    let companyLink=sub.querySelector(':scope > .job-company-link');
    if(!companyLink){
      companyLink=document.createElement('span');
      companyLink.className='job-company-link job-sub-link';
      if(sub.hasAttribute('role'))companyLink.setAttribute('role',sub.getAttribute('role'));
      if(sub.hasAttribute('tabindex'))companyLink.setAttribute('tabindex',sub.getAttribute('tabindex'));
      if(sub.hasAttribute('title'))companyLink.setAttribute('title',sub.getAttribute('title'));
      while(sub.firstChild)companyLink.appendChild(sub.firstChild);
      sub.classList.remove('job-sub-link');
      sub.removeAttribute('role');
      sub.removeAttribute('tabindex');
      sub.removeAttribute('title');
      sub.appendChild(companyLink);
    }

    let meta=sub.querySelector(':scope > .job-meta-inline');
    if(!meta){
      meta=document.createElement('span');
      meta.className='job-meta-inline';
      sub.appendChild(meta);
    }

    const level=right.querySelector(':scope > .lvl');
    if(level)meta.appendChild(level);
    return {meta,right};
  };

  const decorate=article=>{
    const layout=arrangeRow(article);
    if(!layout)return;

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
      layout.meta.appendChild(desktopBadge);
    }
    if(!mobileBadge){
      mobileBadge=document.createElement('span');
      mobileBadge.className='salary-ref salary-ref-mobile';
      const region=layout.right.querySelector(':scope > .tag');
      layout.right.insertBefore(mobileBadge,region||layout.right.firstChild);
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
