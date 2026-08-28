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
    /* Keep posting age in its original right-side position; stabilize every remaining slot. */
    .job-right{grid-template-columns:44px auto 26px 26px;grid-auto-flow:column;align-items:center;gap:var(--s2)}
    .job-right>.age{grid-column:1}
    .job-right>.tag{grid-column:2}
    .job-right>.star{grid-column:3}
    .job-right>.ban{grid-column:4}

    /* Company remains the filter target; optional level and salary flow naturally beside it. */
    .job-sub{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.45}
    .job-company-link{display:inline;white-space:nowrap}
    .job-meta-inline{display:inline-flex;align-items:center;flex-wrap:wrap;gap:7px;margin-left:7px;vertical-align:baseline}
    .job-meta-inline .lvl{min-width:0;text-align:left;line-height:1.25;font-size:9.5px;font-weight:650;letter-spacing:.085em;color:var(--ink-faint)}
    .job-meta-inline .lvl::before{content:'·';margin-right:7px;color:var(--ink-faint);font-family:var(--sans);font-weight:400;letter-spacing:0}

    /* Salary is the only emphasized optional datum, but remains quieter than the title. */
    .salary-ref{display:inline-flex;align-items:center;justify-content:center;min-height:16px;padding:0 6px;border-radius:5px;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.015em;white-space:nowrap;color:var(--gold-deep);background:color-mix(in srgb,var(--gold) 9%,transparent);box-shadow:none}
    [data-theme="dark"] .salary-ref{color:var(--gold-hi);background:color-mix(in srgb,var(--gold) 10%,transparent)}

    /* Actions stay available but recede until the row is engaged. */
    @media(min-width:721px){
      .job-right .icon-btn{opacity:.42}
      .job:hover .job-right .icon-btn,.job-right .icon-btn:focus-visible,.job-right .star.on{opacity:1}
    }

    body.compact .job-right{gap:var(--s2)}
    body.compact .job-meta-inline{gap:5px;margin-left:5px}
    body.compact .job-meta-inline .lvl{font-size:8.8px}
    body.compact .job-meta-inline .lvl::before{margin-right:5px}
    body.compact .salary-ref{min-height:14px;padding:0 5px;font-size:8.7px}

    @media(max-width:720px){
      .job-sub{line-height:1.38}
      .job-company-link{white-space:normal}
      .job-meta-inline{gap:5px;margin-left:5px}
      .job-meta-inline .lvl{font-size:9px}
      .job-meta-inline .lvl::before{margin-right:5px}
      .salary-ref{min-width:0;font-size:9px}
      .job-right{grid-template-columns:auto auto 26px 26px;justify-content:start;margin-top:4px}
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
    return meta;
  };

  const decorate=article=>{
    const meta=arrangeRow(article);
    if(!meta)return;

    const link=article.querySelector('.job-title')?.href||'';
    const id=article.dataset.id||jobId(link);
    const salary=salaryById.get(id)||salaryById.get(jobId(link));
    let badge=article.querySelector('.salary-ref');

    if(!salary){badge?.remove();return;}
    if(!badge){
      badge=document.createElement('span');
      badge.className='salary-ref';
      meta.appendChild(badge);
    }
    badge.textContent=salary;
    badge.setAttribute('aria-label',`薪资 ${salary}`);
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
