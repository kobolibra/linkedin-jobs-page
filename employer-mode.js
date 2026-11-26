/* Browser-local, global market-data scope. Full remains the original dataset. */
(function(root){
  'use strict';
  const KEY='next-journey-employer-mode';
  const valid=value=>['direct','agency','full'].includes(value);
  const normalize=value=>valid(value)?value:'full';
  const matches=(job,mode)=>normalize(mode)==='full'||(job?.employerType==='direct_employer')===(mode==='direct');
  const unavailable=()=>Object.assign(new Error('Employer classifications unavailable'),{code:'EMPLOYER_MODE_UNAVAILABLE'});
  function scope(doc,mode){
    mode=normalize(mode);
    if(mode==='full')return doc;
    if(!doc||doc.employerModeSchema!==1||!Array.isArray(doc.jobs)||doc.jobs.some(job=>typeof job?.employerType!=='string'))throw unavailable();
    const jobs=doc.jobs.filter(job=>matches(job,mode));
    if(doc.source==='public-preview'){
      const previewOverview=doc.previewOverviewByMode?.[mode];
      if(!previewOverview)throw unavailable();
      return {...doc,jobs,previewOverview};
    }
    const postingHistoryDaily=doc.postingHistoryDailyByMode?.[mode];
    if(doc.postingHistoryDaily&&!postingHistoryDaily)throw unavailable();
    return {...doc,jobs,postingHistoryDaily:postingHistoryDaily||null};
  }
  let selected='full';
  const api={KEY,normalize,matches,scope,current:()=>selected,set:setMode};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.EmployerMode=api;
  let select;
  function setMode(value,{notify=true}={}){
    const mode=normalize(value),previous=selected;
    selected=mode;
    if(typeof document==='undefined')return mode;
    if(select)select.value=mode;
    document.documentElement.dataset.employerMode=mode;
    let persisted=false;
    try{localStorage.setItem(KEY,mode);persisted=localStorage.getItem(KEY)===mode;}catch{}
    const url=new URL(location.href);
    if(persisted)url.searchParams.delete('employerMode');else url.searchParams.set('employerMode',mode);
    if(url.href!==location.href)try{history.replaceState(history.state,'',url.href);}catch{}
    if(notify&&previous!==mode)root.dispatchEvent(new CustomEvent('employermodechange',{detail:{mode,previous}}));
    return mode;
  }
  if(typeof document==='undefined')return;
  select=document.getElementById('employerMode');
  if(!select)return;
  const url=new URL(location.href);
  let saved=null;
  try{saved=localStorage.getItem(KEY);}catch{}
  selected=normalize(valid(url.searchParams.get('employerMode'))?url.searchParams.get('employerMode'):saved);
  select.value=selected;
  document.documentElement.dataset.employerMode=selected;
  select.addEventListener('change',()=>setMode(select.value));
})(typeof globalThis!=='undefined'?globalThis:this);
