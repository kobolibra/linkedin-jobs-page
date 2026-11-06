/* Personal application tracking. Immutable events use the account's durable outbox. */
(()=>{
 'use strict';
 const stages=[['saved','Saved'],['applied','Applied'],['contact','Recruiter Contact'],['first','1st Interview'],['second','2nd Interview'],['final','Final Interview'],['offer','Offer'],['no_response','No Response'],['rejected','Rejected']];
 const positive=['applied','contact','first','second','final','offer'];
 const labels=Object.fromEntries(stages),rank=s=>positive.indexOf(s),terminal=s=>s==='rejected'||s==='no_response';
 const regionNames={CN:'Mainland China',HK:'Hong Kong',SG:'Singapore',OTHER:'Other regions',UNKNOWN:'Unspecified'};
 const regionOrder=Object.keys(regionNames);
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function valid(e){return e?.v===1&&typeof e.id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(e.id)&&typeof e.j==='string'&&e.j.trim()===e.j&&e.j.length>0&&e.j.length<=300&&!/[\u0000-\u001f\u007f]/.test(e.j)&&Number.isSafeInteger(e.t)&&e.t>=0&&e.t<=8640000000000000&&(e.r===undefined||regionOrder.includes(e.r))&&Array.isArray(e.p)&&e.p.length<=positive.length&&e.p.every((s,i)=>positive.includes(s)&&(i===0||rank(s)>rank(e.p[i-1])))&&(e.s==='saved'?e.p.length===0:terminal(e.s)||(positive.includes(e.s)&&e.p.at(-1)===e.s));}
 function index(items){const map=new Map();for(const text of items||[]){try{const e=JSON.parse(text);if(!valid(e))continue;const old=map.get(e.j);if(!old||e.t>old.t||(e.t===old.t&&e.id>old.id))map.set(e.j,e);}catch{}}return map;}
 function transition(previous,stage,{job,id,time=Date.now(),region}={}){
  if(!Object.hasOwn(labels,stage))throw Error('Invalid stage');
  let path=[...(previous?.p||[])];
  if(stage==='saved')path=[];
  else if(!terminal(stage)){path=path.filter(s=>rank(s)<rank(stage));path.push(stage);}
  const event={v:1,id,j:job,s:stage,p:path,t:Math.max(time,(previous?.t??-1)+1)};
  const knownRegion=region||previous?.r;if(regionOrder.includes(knownRegion))event.r=knownRegion;
  if(!valid(event)||JSON.stringify(event).length>500)throw Error('Invalid application event');
  return event;
 }
 function jobKey(link){const raw=String(link||''),path=raw.split(/[?#]/)[0],view=path.match(/\/jobs\/view\/([^/]+)\/?$/i),id=view?.[1].match(/\d{7,}/g)?.at(-1)||raw.match(/[?&]currentJobId=(\d+)/)?.[1];return id?'ln:'+id:path.replace(/\/+$/,'');}
 function regionIndex(rows){
  const result=new Map(),canonical=typeof keepLatestSameCityTitle==='function'?keepLatestSameCityTitle(rows||[]):rows||[];
  for(const row of canonical){const id=jobKey(row.link);if(!id)continue;const region=String(row.location||'').toUpperCase();result.set(id,regionOrder.includes(region)&&region!=='UNKNOWN'?region:'UNKNOWN');}
  return result;
 }
 function regionOf(job,states,regions){const region=regions.get(job)||states.get(job)?.r;return regionOrder.includes(region)?region:'UNKNOWN';}
 // A saved role contributes exactly one unit. Missing rounds are never inferred.
 function graph(favorites,states,{regions=new Map()}={}){
  const nodes=new Map(),links=new Map(),counts=Object.fromEntries(stages.map(([s])=>[s,0]));
  const regionCounts=Object.fromEntries(regionOrder.map(r=>[r,0]));
  const unique=[...new Set(favorites)];for(const job of unique)regionCounts[regionOf(job,states,regions)]++;
  const selected=unique,offset=1;
  const splitOffers=selected.some(job=>{const state=states.get(job);return terminal(state?.s)&&state.p.includes('offer');});
  const node=(id,label,column,type='stage',context='')=>{if(!nodes.has(id))nodes.set(id,{id,label,column,type,context,value:0});return id;};
  const connect=(a,b)=>{const key=a+'>'+b;if(!links.has(key))links.set(key,{source:a,target:b,value:0});links.get(key).value++;};
  let interviewing=0,applied=0;
  for(const job of selected){
   const state=states.get(job)||{s:'saved',p:[]};counts[state.s]++;
   if(state.p.length)applied++;
   if(['first','second','final'].includes(state.s))interviewing++;
   let from=node('saved','Saved',offset),column=offset;
   const r=regionOf(job,states,regions);connect(node('region:'+r,regionNames[r],0,'region',r),from);
   for(const stage of state.p){column=rank(stage)+1+offset;const next=node(stage,labels[stage],column);connect(from,next);from=next;}
   if(state.s==='offer'){if(splitOffers)connect(from,node('outcome:offer','Offer received',positive.length+1+offset,'offer'));continue;}
   const type=terminal(state.s)?state.s:'waiting';
   const label=type==='rejected'?'Rejected':type==='no_response'?'No Response':from==='saved'?'Not applied':from==='contact'?'In contact':from==='applied'?'Awaiting response':'In progress';
   const end=node((type==='waiting'?'waiting:':type+':')+from,label,column+1,type,labels[from]);connect(from,end);
  }
  for(const n of nodes.values()){
   const incoming=[...links.values()].filter(l=>l.target===n.id).reduce((v,l)=>v+l.value,0),outgoing=[...links.values()].filter(l=>l.source===n.id).reduce((v,l)=>v+l.value,0);
   n.value=Math.max(incoming,outgoing);
  }
  return {nodes:[...nodes.values()],links:[...links.values()],counts,total:selected.length,allTotal:unique.length,interviewing,applied,regionCounts};
 }
 // A poster composition: regional sources, a central saved-role hub, rising stages.
 function layout(data,{compact=false}={}){
  const mass=compact?118:Math.min(316,152+data.total*6),unit=mass/data.total,nodeWidth=compact?12:16,columnWidth=compact?144:172,sourceX=compact?124:155,sourceGap=compact?48:74;
  const sources=data.nodes.filter(n=>n.type==='region');
  const centre=(compact?72:98)+(mass+Math.max(0,sources.length-1)*sourceGap)/2;
  const order={stage:0,offer:1,waiting:2,no_response:3,rejected:4};
  const nodes=data.nodes.map(n=>({...n,x:sourceX+n.column*columnWidth,h:n.value*unit}));
  const maxColumn=Math.max(...nodes.map(n=>n.column));
  for(let column=0;column<=maxColumn;column++){
   const group=nodes.filter(n=>n.column===column);
   if(column===0&&sources.length){let y=compact?72:98;for(const n of group.sort((a,b)=>regionOrder.indexOf(a.context)-regionOrder.indexOf(b.context))){n.y=y;y+=n.h+sourceGap;}continue;}
   const main=group.filter(n=>n.type==='stage'||n.type==='offer');
   for(const n of main)n.y=Math.max(compact?108:150,centre-Math.max(0,column-1)*(compact?11:33)-n.h/2);
   const previous=nodes.filter(n=>n.column===column-1&&(n.type==='stage'||n.type==='offer'));
   let y=Math.max(centre+(compact?53:68),...main.map(n=>n.y+n.h+(compact?42:66)),...previous.map(n=>n.y+n.h+(compact?45:64)));
   for(const n of group.filter(n=>n.type!=='stage'&&n.type!=='offer').sort((a,b)=>order[a.type]-order[b.type])){n.y=y;y+=n.h+(compact?48:76);}
  }
  const byId=new Map(nodes.map(n=>[n.id,n])),links=data.links.map(l=>({...l}));
  for(const node of nodes){
   let offset=0;
   for(const link of links.filter(l=>l.source===node.id).sort((a,b)=>byId.get(a.target).y-byId.get(b.target).y||byId.get(a.target).column-byId.get(b.target).column)){link.sy=node.y+offset;offset+=link.value*unit;}
   offset=0;
   for(const link of links.filter(l=>l.target===node.id).sort((a,b)=>byId.get(a.source).y-byId.get(b.source).y||byId.get(a.source).column-byId.get(b.source).column)){link.ty=node.y+offset;offset+=link.value*unit;}
  }
  return {nodes,links,byId,unit,nodeWidth,width:Math.max(compact?800:1080,sourceX+maxColumn*columnWidth+(compact?180:250)),height:Math.max(...nodes.map(n=>n.y+n.h))+(compact?64:76)};
 }

 function svg(data,{compact=false}={}){
  if(!data.total)return '';
  const {nodes,links,byId,unit,nodeWidth,width,height}=layout(data,{compact});
  const tone=n=>n.type==='region'||n.id==='saved'?'source':positive.includes(n.id)?n.id:n.type;
  const color=n=>'var(--ap-tone-'+tone(n)+')';
  let paths='';
  for(const link of links){
   const a=byId.get(link.source),b=byId.get(link.target),h=link.value*unit,x=a.x+nodeWidth,x2=b.x,dx=(x2-x)*.5,y=link.sy,y2=link.ty;
   const context=b.context&&b.type!=='region'?' after '+b.context:'';
   const label=a.label+' → '+b.label+context+': '+link.value+' '+(link.value===1?'role':'roles');
   paths+='<path class="ap-flow ap-flow-'+(a.type==='region'?'region':b.id==='offer'?'offer':b.type)+'" style="fill:var(--ap-flow-'+tone(b.id==='offer'||['offer','waiting','no_response','rejected'].includes(b.type)?b:a)+')" tabindex="0" role="img" aria-label="'+escape(label)+'" d="M'+x+','+y+' C'+(x+dx)+','+y+' '+(x2-dx)+','+y2+' '+x2+','+y2+' L'+x2+','+(y2+h)+' C'+(x2-dx)+','+(y2+h)+' '+(x+dx)+','+(y+h)+' '+x+','+(y+h)+' Z"><title>'+escape(label)+'</title></path>';
  }
  const bars=nodes.map(n=>{
   const percent=Math.round(n.value/data.total*100);
   let title='<text x="'+n.x+'" y="'+(n.y-50)+'" class="ap-node-label">'+escape(n.label)+'</text>';
   if(compact&&n.label.length>15&&n.type!=='region'){const words=n.label.split(' '),first=words.shift();title='<text x="'+n.x+'" y="'+(n.y-72)+'" class="ap-node-label"><tspan>'+escape(first)+'</tspan><tspan x="'+n.x+'" dy="20">'+escape(words.join(' '))+'</tspan></text>';}
   if(n.type==='region'){
    const code=n.context==='UNKNOWN'?'—':n.context==='OTHER'?'INTL':n.context;
    title='<text x="'+(compact?116:144)+'" y="'+(n.y+n.h/2-5)+'" text-anchor="end" class="ap-region-code">'+code+'</text><text x="'+(compact?116:144)+'" y="'+(n.y+n.h/2+25)+'" text-anchor="end" class="ap-region-name">'+escape(n.label)+'</text>';
   }

   const side=['waiting','no_response','rejected'].includes(n.type);
   if(side)title='<text x="'+(n.x+nodeWidth+12)+'" y="'+(n.y+5)+'" class="ap-node-label ap-terminal-label">'+escape(n.label==='Awaiting response'?'Awaiting reply':n.label)+'</text>';
   const valueX=side?n.x+nodeWidth+12:n.x,valueY=side?n.y+32:n.y-19;
   return '<g class="ap-node ap-node-'+n.type+(n.id==='offer'?' ap-node-offer':'')+(n.id==='saved'?' ap-node-hub':'')+'" data-tone="'+tone(n)+'" style="color:'+color(n)+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+nodeWidth+'" height="'+n.h+'" rx="2" fill="'+color(n)+'"/>'+title+'<text x="'+valueX+'" y="'+valueY+'" class="ap-node-value'+(side?' ap-terminal-value':'')+'"><tspan>'+n.value+'</tspan><tspan class="ap-node-share" dx="11">'+percent+'%</tspan></text></g>';
  }).join('');
  return '<svg class="'+(compact?'ap-compact-svg':'ap-full-svg')+'" preserveAspectRatio="xMidYMid meet" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Application journey for '+data.total+' saved jobs"><title>Your application journey</title><desc>Regions feed the saved-role total. Widths represent job counts; percentages use saved roles. Only recorded stages are included.</desc>'+paths+bars+'</svg>';
 }
 const api={stages,valid,index,transition,graph,layout,svg,jobKey,regionOf,regionIndex,button:()=>'',sheet:()=>{},open:()=>{}};globalThis.JobApplications=api;
 if(typeof document==='undefined'||!globalThis.AccountPreferences)return;
 const preferences=globalThis.AccountPreferences,host=document.getElementById('jobs');if(!host)return;
 let regions=new Map();
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
  if(!group.children.length)group.innerHTML=positive.map(s=>[s,labels[s]]).map(([s,label],i)=>'<button type="button" data-stage="'+s+'" aria-pressed="false"><span class="ap-step-dot" aria-hidden="true">'+(i+1)+'</span><span>'+label+'</span><span class="ap-step-check" aria-hidden="true">✓</span></button>').join('');
  for(const button of editor.querySelectorAll('[data-stage]')){const current=button.dataset.stage===state.s;button.setAttribute('aria-pressed',String(current));button.classList.toggle('is-recorded',state.p.includes(button.dataset.stage));}
  const last=state.p.at(-1);editor.querySelector('.ap-stage-note').textContent=terminal(state.s)?labels[state.s]+(last?' after '+labels[last]:' before a recorded application'):state.s==='saved'?'Saved · Not yet applied':labels[state.s]+(state.t?' · '+new Date(state.t).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'');
  editor.querySelector('.ap-reset').disabled=state.s==='saved';
  const entries=(preferences.snapshot().applications||[]).map(s=>{try{return JSON.parse(s);}catch{return null;}}).filter(e=>valid(e)&&e.j===selected.dataset.id).sort((a,b)=>b.t-a.t||b.id.localeCompare(a.id));
  const history=editor.querySelector('.ap-history-list');history.replaceChildren();for(const entry of entries){const li=document.createElement('li'),label=document.createElement('span'),time=document.createElement('time');label.textContent=labels[entry.s];time.dateTime=new Date(entry.t).toISOString();time.textContent=new Date(entry.t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});li.append(label,time);history.append(li);}editor.querySelector('.ap-history').hidden=!entries.length;
 }
 function ensureEditor(){if(editor)return;editor=document.createElement('dialog');editor.className='application-editor';editor.setAttribute('aria-labelledby','ap-editor-title');editor.innerHTML='<header class="ap-editor-head"><div><p class="ap-eyebrow" id="ap-editor-title">APPLICATION PROGRESS</p><h2 class="ap-role"></h2><p class="ap-company"></p></div><button type="button" class="ap-close" aria-label="Close application progress">×</button></header><p class="ap-stage-note" aria-live="polite"></p><div class="ap-steps" role="group" aria-label="Application stage"></div><div class="ap-outcomes"><button type="button" data-stage="no_response" aria-pressed="false" title="Mark this when you choose; this status is never set automatically.">No Response</button><button type="button" data-stage="rejected" aria-pressed="false">Rejected</button><button type="button" class="ap-reset" data-stage="saved">Reset to Saved</button></div><p class="ap-editor-note">Select your current stage. Only the stages you record appear in your journey.</p><details class="ap-history"><summary>Stage history</summary><ol class="ap-history-list"></ol></details><p class="ap-error" role="alert" hidden></p>';document.body.append(editor);
  editor.addEventListener('click',e=>{if(e.target.closest('.ap-close')){editor.close();return;}const button=e.target.closest('[data-stage]');if(!button||!selected)return;
   try{const job=selected.dataset.id,previous=states.get(job),stage=button.dataset.stage;if((previous?.s||'saved')===stage)return;if(!favorites.has(job))return;
    const event=transition(previous,stage,{job,id:crypto.randomUUID().replaceAll('-',''),region:regions.get(job)});
    const items=new Set(preferences.snapshot().applications||[]);items.add(JSON.stringify(event));preferences.set('applications',JSON.stringify([...items]));refresh();editor.querySelector('.ap-error').hidden=true;position();
   }catch{const error=editor.querySelector('.ap-error');error.textContent='Could not save this change. Please try again.';error.hidden=false;}
  });
  editor.addEventListener('pointerenter',()=>clearTimeout(closeTimer));editor.addEventListener('pointerleave',()=>{if(hoverOpened)scheduleClose();});editor.addEventListener('focusout',()=>{if(hoverOpened)scheduleClose();});
  editor.addEventListener('close',()=>{if(editor.open)return;anchor?.setAttribute('aria-expanded','false');const focus=anchor;selected=null;anchor=null;if(!hoverOpened&&focus?.isConnected)focus.focus({preventScroll:true});});
 }
 api.open=(card,button,modal=false,hover=false)=>{if(!card||(!modal&&!card.isConnected)||!button?.isConnected||!favorites.has(card.dataset.id))return;clearTimeout(closeTimer);ensureEditor();if(editor.open&&(selected!==card||editor.matches(':modal')!==modal))editor.close();selected=card;anchor=button;hoverOpened=hover;renderEditor();anchor?.setAttribute('aria-expanded','true');if(!editor.open){if(modal){editor.classList.add('is-modal');editor.style.cssText='';editor.showModal();}else{editor.classList.remove('is-modal');const priorFocus=document.activeElement;editor.show();position();if(hover&&priorFocus?.isConnected)priorFocus.focus({preventScroll:true});}}else if(!modal)position();};
 function scheduleClose(){clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(editor?.open&&!editor.matches(':hover')&&!editor.contains(document.activeElement)&&!anchor?.matches(':hover'))editor.close();},220);}
 host.addEventListener('pointerover',e=>{const trigger=e.target.closest('.application-trigger');if(!trigger||e.pointerType==='touch'||!matchMedia('(hover:hover)').matches)return;clearTimeout(hoverTimer);clearTimeout(closeTimer);hoverTimer=setTimeout(()=>api.open(trigger.closest('.job'),trigger,false,true),120);});
 host.addEventListener('pointerout',e=>{if(e.target.closest('.application-trigger')){clearTimeout(hoverTimer);if(hoverOpened)scheduleClose();}});
 host.addEventListener('click',e=>{const button=e.target.closest('.application-trigger');if(button){e.preventDefault();api.open(button.closest('.job'),button,matchMedia('(max-width:720px)').matches);}});
 document.addEventListener('click',e=>{if(editor?.open&&!editor.classList.contains('is-modal')&&!editor.contains(e.target)&&!e.target.closest('.application-trigger,[data-action="application"]'))editor.close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&editor?.open){e.preventDefault();editor.close();}});
 addEventListener('scroll',()=>{if(editor?.open&&!editor.classList.contains('is-modal')){if(!anchor?.isConnected)editor.close();else position();}},{passive:true});addEventListener('resize',()=>{if(editor?.open&&!editor.classList.contains('is-modal'))position();},{passive:true});
 document.addEventListener('jobsfilterchange',()=>{if(editor?.open&&!editor.classList.contains('is-modal')){if(!selected?.isConnected||selected.classList.contains('hidden')||!selected.getClientRects().length)editor.close();else position();}});
 function renderJourney(){const phonePortrait=matchMedia('(pointer:coarse) and (orientation:portrait)').matches,compact=(phonePortrait?innerWidth:innerHeight)<850;journey.classList.toggle('is-compact',compact);const data=graph(favorites,states,{regions});journey.querySelector('.ap-kpis').innerHTML=[['Saved',data.total],['Applications',data.applied],['Interviewing',data.interviewing],['Offers',data.counts.offer]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('');
  const chart=journey.querySelector('.ap-chart');chart.innerHTML=data.total?svg(data,{compact}):'<div class="ap-empty"><h3>'+ (data.allTotal?'No saved roles in this region':'No saved roles yet') +'</h3><p>'+(data.allTotal?'Choose another region to see your application progress.':'Save a role and record your progress to see it here.')+'</p></div>';
  journey.querySelector('.ap-legend').hidden=!data.total;
  journey.querySelector('.ap-stage-summary').innerHTML=stages.map(([s,label])=>'<div><dt>'+label+'</dt><dd>'+data.counts[s]+'</dd></div>').join('');
 }
 function openJourney(){if(!journey){journey=document.createElement('dialog');journey.className='application-journey';journey.setAttribute('aria-labelledby','ap-journey-title');journey.innerHTML='<header class="ap-journey-head"><div><p class="ap-journey-kicker">THE APPLICATION ATLAS</p><h2 id="ap-journey-title">Your application journey</h2><p class="ap-journey-dek">Every saved role. Every recorded step.</p></div><dl class="ap-kpis"></dl><button type="button" class="ap-close" aria-label="Close application journey">×</button></header><div class="ap-chart" tabindex="0" aria-label="Application flow chart, fitted to the screen."></div><div class="ap-legend"><span class="ap-key-progress">Applied</span><span class="ap-key-contact">Recruiter Contact</span><span class="ap-key-interviews">Interviews</span><span class="ap-key-waiting">In progress / Not applied</span><span class="ap-key-offer">Offer</span><span class="ap-key-no-response">No Response</span><span class="ap-key-rejected">Rejected</span></div><details class="ap-accessible-data"><summary>Current stage breakdown</summary><dl class="ap-stage-summary"></dl></details><footer>Private to your account · Widths show role counts; percentages use saved roles in this view.</footer>';document.body.append(journey);journey.querySelector('.ap-close').onclick=()=>journey.close();journey.addEventListener('click',e=>{if(e.target===journey){const b=journey.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)journey.close();}});journey.addEventListener('close',()=>{document.documentElement.classList.remove('ap-journey-open');returnFocus?.focus({preventScroll:true});});}returnFocus=document.activeElement;renderJourney();document.documentElement.classList.add('ap-journey-open');journey.showModal();}
 // Route icon: Lucide contributors, ISC; see licenses/lucide-route.txt.
 const JOURNEY_ICON='<svg class="ap-journey-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>';
 const journeyButton=document.createElement('button');journeyButton.type='button';journeyButton.className='pill application-journey-toggle';journeyButton.innerHTML=JOURNEY_ICON+'<span>My Journey</span>';journeyButton.setAttribute('aria-haspopup','dialog');journeyButton.onclick=openJourney;const entry=document.createElement('div');entry.className='application-journey-entry';entry.hidden=true;entry.innerHTML='<div><p class="ap-eyebrow">YOUR APPLICATIONS</p><p class="ap-entry-caption">Track your saved roles, from application to outcome.</p></div>';entry.append(journeyButton);document.querySelector('.content-row')?.before(entry);const toggleEntry=()=>{entry.hidden=!document.getElementById('favToggle')?.classList.contains('active');};document.getElementById('favToggle')?.addEventListener('click',()=>queueMicrotask(toggleEntry));document.addEventListener('jobsfilterchange',toggleEntry);const accountEntry=document.createElement('button');accountEntry.type='button';accountEntry.className='account-journey';accountEntry.innerHTML=JOURNEY_ICON+'<span>My Journey</span>';accountEntry.onclick=openJourney;document.querySelector('.account-sync-now')?.before(accountEntry);
 let journeyResize=0;addEventListener('resize',()=>{cancelAnimationFrame(journeyResize);journeyResize=requestAnimationFrame(()=>{if(journey?.open)renderJourney();});},{passive:true});
 // Reuse the already-requested index; never fetch data just to draw a personal chart.
 window.__jobsDataPromise?.then(rows=>{regions=regionIndex(rows);if(journey?.open)renderJourney();}).catch(()=>{});
 addEventListener('account-preferences',refresh);refresh();
})();
