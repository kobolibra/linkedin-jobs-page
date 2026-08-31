/* Remove inferred job levels, replace the native <details> JD disclosure with a
   plain button so flex order is authoritative, and display optional WIP salary. */
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

    /* JD disclosure. WebKit implements <details> with shadow DOM and wraps the
       non-summary content in an anonymous slot box; with display:contents that
       anonymous box is the one that participates in the parent flex layout, it
       cannot be selected by CSS, and it keeps order:0. That produced the
       leading indent on every card that has a JD and pushed the JD body above
       the company row when open. The markup is rewritten below so no <details>
       and no anonymous box exist, which makes order authoritative. */
    .job-jd-toggle{
      appearance:none;
      -webkit-appearance:none;
      background:none;
      border:0;
      padding:0;
      margin:0;
      cursor:pointer;
      color:var(--region,var(--navy));
      flex:0 0 auto;
      align-self:center;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:14px;
      height:14px;
      -webkit-tap-highlight-color:transparent;
    }
    .job-jd-toggle::before{
      content:"";
      display:block;
      width:0;
      height:0;
      border-left:5px solid currentColor;
      border-top:3.5px solid transparent;
      border-bottom:3.5px solid transparent;
      transform:rotate(0deg);
      transform-origin:center;
      transition:transform .18s ease;
    }
    .job-jd-toggle[aria-expanded="true"]::before{transform:rotate(90deg)}
    @media (prefers-reduced-motion:reduce){
      .job-jd-toggle::before{transition:none}
    }
    .job-jd-text{
      display:none;
      flex:1 1 100%;
      order:9;
      width:100%;
      max-width:100%;
      min-width:0;
      margin-top:6px;
      color:var(--ink-soft);
      font-size:12px;
      line-height:1.5;
      white-space:normal;
      overflow-wrap:anywhere;
    }
    .job-jd-toggle[aria-expanded="true"] ~ .job-jd-text{display:block}

    @media(max-width:720px){
      /* Preserve the original title/company wrapping; only split the company row into left and right. */
      .job-sub{
        display:flex;
        align-items:center;
        gap:6px;
        min-width:0;
        overflow:hidden;
      }
      .job-company-text{
        flex:0 1 auto;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .salary-ref-desktop{display:none}
      .salary-ref-mobile{
        display:inline-flex;
        flex:0 0 auto;
        align-self:center;
        line-height:15px;
        margin-left:0;
        min-width:0;
        min-height:15px;
        padding:0 6px;
        border-radius:4px;
        font-size:8.8px;
      }
      body.compact .job-sub{overflow:hidden}
      body.compact .job-company-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.compact .salary-ref-mobile{min-height:14px;padding:0 5px;font-size:8.5px}
      /* Row 3: city, salary, arrow. Row 4: JD body, full width, from the left. */
      .job-jd-toggle{order:6;margin-top:5px}
      .job-jd-text{order:9;margin-top:6px}
    }
  `;
  document.head.appendChild(style);

  let salaryById=new Map();

  /* Rewrite <details class="job-jd"><summary/><div class="job-jd-text"/></details>
     into a sibling pair: <button class="job-jd-toggle"/> + <div class="job-jd-text"/>.
     Idempotent: once the <details> is gone there is nothing left to match. */
  const upgradeJd=article=>{
    const details=article.querySelector('details.job-jd');
    if(!details)return;
    const parent=details.parentNode;
    if(!parent)return;
    const body=details.querySelector('.job-jd-text');
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='job-jd-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','展开职位描述');
    parent.insertBefore(toggle,details);
    if(body)parent.insertBefore(body,details);
    details.remove();
  };

  host.addEventListener('click',event=>{
    const toggle=event.target?.closest?.('.job-jd-toggle');
    if(!toggle||!host.contains(toggle))return;
    event.preventDefault();
    const open=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',open?'false':'true');
    toggle.setAttribute('aria-label',open?'展开职位描述':'收起职位描述');
  });

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
    upgradeJd(article);
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
      const anchor=detail?.querySelector('.job-jd-toggle')||detail?.querySelector('.job-right-mobile');
      if(anchor) anchor.parentNode.insertBefore(mobileBadge,anchor); else (detail||company.sub).appendChild(mobileBadge);
    }

    if(detail&&mobileBadge){
      const anchor=detail.querySelector('.job-jd-toggle')||detail.querySelector('.job-right-mobile');
      if(anchor && mobileBadge!==anchor) anchor.parentNode.insertBefore(mobileBadge,anchor);
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
