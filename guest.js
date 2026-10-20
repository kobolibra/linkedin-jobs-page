/* Only the fixed public preview is present in this document. */
(()=>{
 const rows=[...document.querySelectorAll('.role')],filters=[...document.querySelectorAll('[data-filter]')],dialog=document.getElementById('signInDialog'),google=dialog.querySelector('.google-link'),status=dialog.querySelector('.dialog-status');
 let region='ALL',intent=null,leaving=false,timer;
 const read=()=>{try{return JSON.parse(sessionStorage.getItem('finance-preview-state')||'null');}catch{return null;}};
 const save=()=>{try{sessionStorage.setItem('finance-preview-state',JSON.stringify({region,scroll:scrollY,at:Date.now()}));}catch{}};
 function filter(value){region=['CN','HK','SG'].includes(value)?value:'ALL';let count=0;for(const row of rows){row.hidden=region!=='ALL'&&row.dataset.region!==region;if(!row.hidden)count++;}for(const button of filters)button.setAttribute('aria-pressed',String(button.dataset.filter===region));document.querySelector('.filter-note').textContent=`Showing ${count} preview role${count===1?'':'s'}`;}
 const previous=read();if(previous&&Date.now()-previous.at<1800000){filter(previous.region);requestAnimationFrame(()=>scrollTo(0,Math.max(0,Number(previous.scroll)||0)));}
 for(const button of filters)button.addEventListener('click',()=>{filter(button.dataset.filter);save();});
 for(const button of document.querySelectorAll('[data-open-preview]'))button.addEventListener('click',()=>{const detail=button.closest('.role').querySelector('details');detail.open=!detail.open;});
 const copy={browse:['See the full collection','Browse every role and keep your shortlist in sync.'],search:['Search the full collection','Find roles by company, location and keyword.'],save:['Save this role','Keep your shortlist in sync across devices.'],block:['Make the list your own','Hide companies and keep your preferences in sync.'],details:['Read the full description','Explore the complete role and its analysis.']};
 document.addEventListener('click',e=>{const link=e.target.closest('[data-intent]');if(!link||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||typeof dialog.showModal!=='function')return;e.preventDefault();save();intent={action:link.dataset.intent,region,at:Date.now()};const row=link.closest('.role');if(row){intent.id=row.dataset.id;intent.title=row.dataset.title;}const words=copy[intent.action]||copy.browse;document.getElementById('dialogTitle').textContent=words[0];document.getElementById('dialogCopy').textContent=words[1];status.textContent='';dialog.showModal();document.body.classList.add('modal-open');});
 dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');});
 google.addEventListener('click',e=>{if(leaving){e.preventDefault();return;}leaving=true;try{sessionStorage.setItem('finance-preview-intent',JSON.stringify(intent||{action:'browse',region,at:Date.now()}));}catch{}google.setAttribute('aria-busy','true');status.textContent='Opening Google…';timer=setTimeout(()=>{leaving=false;google.removeAttribute('aria-busy');status.textContent='Not redirected? Select Continue with Google to try again.';},15000);});
 addEventListener('pageshow',event=>{if(event.persisted){try{sessionStorage.removeItem('finance-preview-intent');}catch{}}clearTimeout(timer);leaving=false;google.removeAttribute('aria-busy');status.textContent='';});
 addEventListener('pagehide',save);
})();
