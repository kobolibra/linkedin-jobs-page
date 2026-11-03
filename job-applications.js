/* Personal application tracking. Immutable events use the account's durable outbox. */
(()=>{
 'use strict';
 const stages=[['saved','Saved'],['applied','Applied'],['first','1st Interview'],['second','2nd Interview'],['final','Final Interview'],['offer','Offer'],['rejected','Rejected']];
 const positive=stages.slice(1,6).map(s=>s[0]),labels=Object.fromEntries(stages),rank=s=>positive.indexOf(s);
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function valid(e){return e?.v===1&&typeof e.id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(e.id)&&typeof e.j==='string'&&e.j.trim()===e.j&&e.j.length>0&&e.j.length<=300&&!/[\u0000-\u001f\u007f]/.test(e.j)&&Number.isSafeInteger(e.t)&&e.t>=0&&e.t<=8640000000000000&&Array.isArray(e.p)&&e.p.length<=5&&e.p.every((s,i)=>positive.includes(s)&&(i===0||rank(s)>rank(e.p[i-1])))&&(e.s==='saved'?e.p.length===0:e.s==='rejected'||(positive.includes(e.s)&&e.p.at(-1)===e.s));}
 function index(items){const map=new Map();for(const text of items||[]){try{const e=JSON.parse(text);if(!valid(e))continue;const old=map.get(e.j);if(!old||e.t>old.t||(e.t===old.t&&e.id>old.id))map.set(e.j,e);}catch{}}return map;}
 function transition(previous,stage,{job,id,time=Date.now()}={}){
  if(!Object.hasOwn(labels,stage))throw Error('Invalid stage');
  let path=[...(previous?.p||[])];
  if(stage==='saved')path=[];
  else if(stage!=='rejected'){path=path.filter(s=>rank(s)<rank(stage));path.push(stage);}
  const event={v:1,id,j:job,s:stage,p:path,t:Math.max(time,(previous?.t??-1)+1)};
  if(!valid(event)||JSON.stringify(event).length>500)throw Error('Invalid application event');
  return event;
 }
 // Count each saved job once, following only stages explicitly recorded by its owner.
 function graph(favorites,states){
  const nodes=new Map(),links=new Map(),counts=Object.fromEntries(stages.map(([s])=>[s,0]));
  const node=(id,label,column,type='stage')=>{if(!nodes.has(id))nodes.set(id,{id,label,column,type,value:0});return id;};
  const connect=(a,b)=>{const key=a+'>'+b;if(!links.has(key))links.set(key,{source:a,target:b,value:0});links.get(key).value++;};
  const unique=new Set(favorites);let interviewing=0,applied=0;
  for(const job of unique){const state=states.get(job)||{s:'saved',p:[]};counts[state.s]++;if(state.p.length)applied++;if(['first','second','final'].includes(state.s))interviewing++;
   let from=node('saved','Saved',0),column=0;
   for(const stage of state.p){column=rank(stage)+1;const next=node(stage,labels[stage],column);connect(from,next);from=next;}
   if(state.s==='offer'){connect(from,node('outcome:offer','Offer received',6,'offer'));continue;}
   const rejected=state.s==='rejected';
   const label=rejected?'Rejected':column===0?'Not applied':column===1?'Awaiting response':'In progress';
   const end=node((rejected?'rejected:':'waiting:')+from,label,column+1,rejected?'rejected':'waiting');connect(from,end);
  }
  for(const n of nodes.values()){const incoming=[...links.values()].filter(l=>l.target===n.id).reduce((v,l)=>v+l.value,0),outgoing=[...links.values()].filter(l=>l.source===n.id).reduce((v,l)=>v+l.value,0);n.value=Math.max(incoming,outgoing);}
  return {nodes:[...nodes.values()],links:[...links.values()],counts,total:unique.size,interviewing,applied};
 }
 function svg(data){
  if(!data.total)return '';
  const unit=250/data.total,nodeWidth=10,columnWidth=174,width=Math.max(720,Math.max(...data.nodes.map(n=>n.column))*columnWidth+170);let height=400;
  const nodes=data.nodes.map(n=>({...n,x:24+n.column*columnWidth,h:n.value*unit})),byId=new Map(nodes.map(n=>[n.id,n]));
  for(let col=0;col<=6;col++){let y=78;for(const n of nodes.filter(n=>n.column===col).sort((a,b)=>({stage:0,waiting:1,offer:1,rejected:2}[a.type]-{stage:0,waiting:1,offer:1,rejected:2}[b.type]))){n.y=y;y+=n.h+52;n.in=0;n.out=0;}}
  height=Math.max(...nodes.map(n=>n.y+n.h))+54;
  const color=n=>n.type==='rejected'?'var(--ap-rejected)':n.type==='waiting'?'var(--ap-waiting)':n.id==='offer'||n.type==='offer'?'var(--ap-offer)':'var(--ap-blue)';
  let paths='';
  for(const link of [...data.links].sort((a,b)=>byId.get(a.target).y-byId.get(b.target).y||byId.get(a.target).column-byId.get(b.target).column)){
   const a=byId.get(link.source),b=byId.get(link.target),h=link.value*unit,x=a.x+nodeWidth,x2=b.x,mid=(x+x2)/2,y=a.y+a.out,y2=b.y+b.in;a.out+=h;b.in+=h;
   const label=a.label+' → '+b.label+': '+link.value;
   paths+='<path class="ap-flow" tabindex="0" role="img" aria-label="'+escape(label)+'" fill="'+color(b)+'" d="M'+x+','+y+' C'+mid+','+y+' '+mid+','+y2+' '+x2+','+y2+' L'+x2+','+(y2+h)+' C'+mid+','+(y2+h)+' '+mid+','+(y+h)+' '+x+','+(y+h)+' Z"><title>'+escape(label)+'</title></path>';
  }
  const bars=nodes.map(n=>'<g><rect x="'+n.x+'" y="'+n.y+'" width="'+nodeWidth+'" height="'+n.h+'" rx="1.5" fill="'+color(n)+'"/><text x="'+n.x+'" y="'+(n.y-26)+'" class="ap-node-label">'+escape(n.label)+'</text><text x="'+n.x+'" y="'+(n.y-9)+'" class="ap-node-value">'+n.value+'</text></g>').join('');
  return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Application journey for '+data.total+' saved jobs"><title>Your application journey</title><desc>Flow widths represent job counts. Only explicitly recorded stages are included. Waiting and rejected jobs branch from their last recorded stage.</desc>'+paths+bars+'</svg>';
 }
 const api={stages,valid,index,transition,graph,svg,button:()=>'',sheet:()=>{},open:()=>{}};globalThis.JobApplications=api;
 if(typeof document==='undefined'||!globalThis.AccountPreferences)return;
 const preferences=globalThis.AccountPreferences,host=document.getElementById('jobs');if(!host)return;
 let states=new Map(),favorites=new Set(),editor=null,selected=null,anchor=null,hoverTimer=0,closeTimer=0,hoverOpened=false,journey=null,returnFocus=null;
 function refresh(){const lists=preferences.snapshot();states=index(lists.applications);favorites=new Set(lists.favs);for(const card of host.querySelectorAll('.job')){
   let button=card.querySelector('.application-trigger');const favorite=favorites.has(card.dataset.id);
   if(!favorite){button?.remove();continue;}
   if(!button){const actions=card.querySelector('.job-actions');if(actions){actions.insertAdjacentHTML('afterbegin',api.button(card.dataset.id,true));button=actions.querySelector('.application-trigger');}}
   if(button)decorate(button,card.dataset.id);
  }if(editor?.open&&selected){if(!favorites.has(selected.dataset.id))editor.close();else renderEditor();}if(journey?.open)renderJourney();}
 function decorate(button,id){const stage=states.get(id)?.s||'saved';button.dataset.stage=stage;button.querySelector('.ap-trigger-label').textContent=labels[stage];button.setAttribute('aria-label','Application progress: '+labels[stage]);}
 api.button=(id,favorite)=>favorite?'<button type="button" class="application-trigger" data-stage="'+(states.get(id)?.s||'saved')+'" aria-haspopup="dialog" aria-expanded="false" aria-label="Application progress: '+labels[states.get(id)?.s||'saved']+'"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 14V9m6 5V4m6 10V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="ap-trigger-label">'+labels[states.get(id)?.s||'saved']+'</span></button>':'';
 api.sheet=(sheet,card,favorite)=>{let button=sheet.querySelector('[data-action="application"]');if(!favorite){button?.remove();return;}if(!button){button=document.createElement('button');button.type='button';button.dataset.action='application';sheet.querySelector('.job-sheet-options').append(button);}button.textContent='Application progress · '+labels[states.get(card.dataset.id)?.s||'saved'];};
 function position(){if(!editor?.open||editor.classList.contains('is-modal')||!anchor?.isConnected)return;const box=anchor.getBoundingClientRect(),width=Math.min(420,innerWidth-24);editor.style.width=width+'px';editor.style.left=Math.max(12,Math.min(box.right-width,innerWidth-width-12))+'px';const h=editor.getBoundingClientRect().height;editor.style.top=Math.max(12,Math.min(box.bottom+10,innerHeight-h-12))+'px';}
 function renderEditor(){const state=states.get(selected.dataset.id)||{s:'saved',p:[]};editor.querySelector('.ap-role').textContent=selected.querySelector('.job-title')?.textContent||'Saved job';editor.querySelector('.ap-company').textContent=selected.dataset.comp||'';
  const group=editor.querySelector('.ap-steps');
  if(!group.children.length)group.innerHTML=stages.slice(1,6).map(([s,label],i)=>'<button type="button" data-stage="'+s+'" aria-pressed="false"><span class="ap-step-dot" aria-hidden="true">'+(i+1)+'</span><span>'+label+'</span><span class="ap-step-check" aria-hidden="true">✓</span></button>').join('');
  for(const button of editor.querySelectorAll('[data-stage]')){const current=button.dataset.stage===state.s;button.setAttribute('aria-pressed',String(current));button.classList.toggle('is-recorded',state.p.includes(button.dataset.stage));}
  const last=state.p.at(-1);editor.querySelector('.ap-stage-note').textContent=state.s==='rejected'?'Rejected'+(last?' after '+labels[last]:' before a recorded application'):state.s==='saved'?'Saved · Not yet applied':labels[state.s]+(state.t?' · '+new Date(state.t).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'');
  editor.querySelector('.ap-reset').disabled=state.s==='saved';
  const entries=(preferences.snapshot().applications||[]).map(s=>{try{return JSON.parse(s);}catch{return null;}}).filter(e=>valid(e)&&e.j===selected.dataset.id).sort((a,b)=>b.t-a.t||b.id.localeCompare(a.id));
  const history=editor.querySelector('.ap-history-list');history.replaceChildren();for(const entry of entries){const li=document.createElement('li'),label=document.createElement('span'),time=document.createElement('time');label.textContent=labels[entry.s];time.dateTime=new Date(entry.t).toISOString();time.textContent=new Date(entry.t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});li.append(label,time);history.append(li);}editor.querySelector('.ap-history').hidden=!entries.length;
 }
 function ensureEditor(){if(editor)return;editor=document.createElement('dialog');editor.className='application-editor';editor.setAttribute('aria-labelledby','ap-editor-title');editor.innerHTML='<header class="ap-editor-head"><div><p class="ap-eyebrow" id="ap-editor-title">APPLICATION PROGRESS</p><h2 class="ap-role"></h2><p class="ap-company"></p></div><button type="button" class="ap-close" aria-label="Close application progress">×</button></header><p class="ap-stage-note" aria-live="polite"></p><div class="ap-steps" role="group" aria-label="Application stage"></div><div class="ap-outcomes"><button type="button" data-stage="rejected" aria-pressed="false">Rejected</button><button type="button" class="ap-reset" data-stage="saved">Reset to Saved</button></div><p class="ap-editor-note">Select your current stage. Only the stages you record appear in your journey.</p><details class="ap-history"><summary>Stage history</summary><ol class="ap-history-list"></ol></details><p class="ap-error" role="alert" hidden></p>';document.body.append(editor);
  editor.addEventListener('click',e=>{if(e.target.closest('.ap-close')){editor.close();return;}const button=e.target.closest('[data-stage]');if(!button||!selected)return;
   try{const job=selected.dataset.id,previous=states.get(job),stage=button.dataset.stage;if((previous?.s||'saved')===stage)return;if(!favorites.has(job))return;
    const event=transition(previous,stage,{job,id:crypto.randomUUID().replaceAll('-','')});
    const items=new Set(preferences.snapshot().applications||[]);items.add(JSON.stringify(event));preferences.set('applications',JSON.stringify([...items]));refresh();editor.querySelector('.ap-error').hidden=true;position();
   }catch{const error=editor.querySelector('.ap-error');error.textContent='Could not save this change. Please try again.';error.hidden=false;}
  });
  editor.addEventListener('pointerenter',()=>clearTimeout(closeTimer));editor.addEventListener('pointerleave',()=>{if(hoverOpened)scheduleClose();});editor.addEventListener('focusout',()=>{if(hoverOpened)scheduleClose();});
  editor.addEventListener('close',()=>{if(editor.open)return;anchor?.setAttribute('aria-expanded','false');const focus=anchor;selected=null;anchor=null;if(!hoverOpened&&focus?.isConnected)focus.focus({preventScroll:true});});
 }
 api.open=(card,button,modal=false,hover=false)=>{if(!card?.isConnected||!button?.isConnected||!favorites.has(card.dataset.id))return;clearTimeout(closeTimer);ensureEditor();if(editor.open&&(selected!==card||editor.matches(':modal')!==modal))editor.close();selected=card;anchor=button;hoverOpened=hover;renderEditor();anchor?.setAttribute('aria-expanded','true');if(!editor.open){if(modal){editor.classList.add('is-modal');editor.style.cssText='';editor.showModal();}else{editor.classList.remove('is-modal');const priorFocus=document.activeElement;editor.show();position();if(hover&&priorFocus?.isConnected)priorFocus.focus({preventScroll:true});}}else if(!modal)position();};
 function scheduleClose(){clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(editor?.open&&!editor.matches(':hover')&&!editor.contains(document.activeElement)&&!anchor?.matches(':hover'))editor.close();},220);}
 host.addEventListener('pointerover',e=>{const trigger=e.target.closest('.application-trigger');if(!trigger||e.pointerType==='touch'||!matchMedia('(hover:hover)').matches)return;clearTimeout(hoverTimer);clearTimeout(closeTimer);hoverTimer=setTimeout(()=>api.open(trigger.closest('.job'),trigger,false,true),120);});
 host.addEventListener('pointerout',e=>{if(e.target.closest('.application-trigger')){clearTimeout(hoverTimer);if(hoverOpened)scheduleClose();}});
 host.addEventListener('click',e=>{const button=e.target.closest('.application-trigger');if(button){e.preventDefault();api.open(button.closest('.job'),button,matchMedia('(max-width:720px)').matches);}});
 document.addEventListener('click',e=>{if(editor?.open&&!editor.classList.contains('is-modal')&&!editor.contains(e.target)&&!e.target.closest('.application-trigger,[data-action="application"]'))editor.close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&editor?.open){e.preventDefault();editor.close();}});
 addEventListener('scroll',()=>{if(editor?.open&&!editor.classList.contains('is-modal')){if(!anchor?.isConnected)editor.close();else position();}},{passive:true});addEventListener('resize',()=>{if(editor?.open&&!editor.classList.contains('is-modal'))position();},{passive:true});
 document.addEventListener('jobsfilterchange',()=>{if(editor?.open&&!editor.classList.contains('is-modal')){if(!selected?.isConnected||selected.classList.contains('hidden')||!selected.getClientRects().length)editor.close();else position();}});
 function renderJourney(){const data=graph(favorites,states);journey.querySelector('.ap-kpis').innerHTML=[['Saved',data.total],['Applications',data.applied],['Interviewing',data.interviewing],['Offers',data.counts.offer]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('');
  const chart=journey.querySelector('.ap-chart');chart.innerHTML=data.total?svg(data):'<div class="ap-empty"><h3>Your next chapter starts with a saved role.</h3><p>Save a job, then record your progress to build your journey.</p></div>';
  journey.querySelector('.ap-legend').hidden=!data.total;
  journey.querySelector('.ap-stage-summary').innerHTML=stages.map(([s,label])=>'<div><dt>'+label+'</dt><dd>'+data.counts[s]+'</dd></div>').join('');
 }
 function openJourney(){if(!journey){journey=document.createElement('dialog');journey.className='application-journey';journey.setAttribute('aria-labelledby','ap-journey-title');journey.innerHTML='<header class="ap-journey-head"><div><p class="ap-eyebrow">YOUR NEXT JOURNEY</p><h2 id="ap-journey-title">Your application journey.</h2><p>A personal view of your saved roles and application progress.</p></div><button type="button" class="ap-close" aria-label="Close application journey">×</button></header><dl class="ap-kpis"></dl><div class="ap-chart" tabindex="0" aria-label="Application flow chart. Scroll horizontally on smaller screens."></div><div class="ap-legend"><span class="ap-key-progress">Progressed</span><span class="ap-key-waiting">In progress / Not applied</span><span class="ap-key-offer">Offer</span><span class="ap-key-rejected">Rejected</span></div><details class="ap-accessible-data"><summary>Current stage breakdown</summary><dl class="ap-stage-summary"></dl></details><footer>Private to your account · All saved roles, across every filter.<br>Flow widths show job counts. Skipped rounds are not inferred. Resetting a stage updates the flow; history stays saved.</footer>';document.body.append(journey);journey.querySelector('.ap-close').onclick=()=>journey.close();journey.addEventListener('click',e=>{if(e.target===journey){const b=journey.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)journey.close();}});journey.addEventListener('close',()=>{document.documentElement.classList.remove('ap-journey-open');returnFocus?.focus({preventScroll:true});});}returnFocus=document.activeElement;renderJourney();document.documentElement.classList.add('ap-journey-open');journey.showModal();}
 const journeyButton=document.createElement('button');journeyButton.type='button';journeyButton.className='pill application-journey-toggle';journeyButton.innerHTML='<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 3h3v12H2zM13 3h3v4h-3zM13 11h3v4h-3zM5 6c4 0 4-1 8-1M5 11c4 0 4 2 8 2"/></svg><span>My Journey</span>';journeyButton.setAttribute('aria-haspopup','dialog');journeyButton.onclick=openJourney;const entry=document.createElement('div');entry.className='application-journey-entry';entry.hidden=true;entry.innerHTML='<div><p class="ap-eyebrow">YOUR APPLICATIONS</p><p class="ap-entry-caption">Track your saved roles, from application to outcome.</p></div>';entry.append(journeyButton);document.querySelector('.content-row')?.before(entry);const toggleEntry=()=>{entry.hidden=!document.getElementById('favToggle')?.classList.contains('active');};document.getElementById('favToggle')?.addEventListener('click',()=>queueMicrotask(toggleEntry));document.addEventListener('jobsfilterchange',toggleEntry);const accountEntry=document.createElement('button');accountEntry.type='button';accountEntry.className='account-journey';accountEntry.textContent='My Journey';accountEntry.onclick=openJourney;document.querySelector('.account-sync-now')?.before(accountEntry);
 addEventListener('account-preferences',refresh);refresh();
})();
