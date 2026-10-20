/* Restore only the visitor's explicit intent, once, after authentication. */
(()=>{
 let intent;try{intent=JSON.parse(sessionStorage.getItem('finance-preview-intent')||'null');}catch{return;}
 if(!intent||Date.now()-intent.at>1800000||Date.now()<intent.at)return;
 try{sessionStorage.removeItem('finance-preview-intent');}catch{}
 const root=document.getElementById('jobs');if(!root)return;
 let filtered=false,done=false;
 const observer=new MutationObserver(restore),timeout=setTimeout(()=>observer.disconnect(),20000);
 function restore(){
  if(done||!root.querySelector('.job'))return;
  if(!filtered){filtered=true;
   if(['CN','HK','SG'].includes(intent.region))document.querySelector('#regions .seg[data-region="'+intent.region+'"]')?.click();
   if(intent.id&&typeof intent.title==='string'){const input=document.getElementById('search');if(input){input.value=intent.title;input.dispatchEvent(new Event('input',{bubbles:true}));}}
   if(!intent.id){done=true;observer.disconnect();clearTimeout(timeout);if(intent.action==='search')document.getElementById('search')?.focus();return;}
  }
  const card=[...root.querySelectorAll('.job')].find(c=>c.dataset.id===intent.id);if(!card)return;
  done=true;observer.disconnect();clearTimeout(timeout);
  if(intent.action==='save'){const star=card.querySelector('.star');if(star?.getAttribute('aria-pressed')!=='true'&&!star?.classList.contains('on'))star?.click();}
  if(intent.action==='details'){const details=card.querySelector('.job-jd');if(details&&!details.open)details.querySelector('summary')?.click();}
  // Hiding is destructive to the current view; focus its control for confirmation.
  const target=intent.action==='block'?card.querySelector('.ban'):card.querySelector('.job-title');
  card.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});
 }
 observer.observe(root,{childList:true,subtree:true});restore();
})();
