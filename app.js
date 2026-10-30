/*
 * LinkedIn 金融职位 · 页面逻辑
 * 依赖：jobs.json
 */
function storageGet(key, session=false){if(!session&&globalThis.AccountPreferences&&['favs','blocked','blockedKw','reads'].includes(key))return globalThis.AccountPreferences.get(key);try{return (session?sessionStorage:localStorage).getItem(key);}catch{return null;}}
function storageSet(key,value,session=false){if(!session&&globalThis.AccountPreferences?.set(key,value))return;try{(session?sessionStorage:localStorage).setItem(key,value);}catch{}}
function storageList(key){try{const list=JSON.parse(storageGet(key)||"[]");return Array.isArray(list)?list.filter(x=>typeof x==="string"):[];}catch{return [];}}
const IC={
  star:'<svg class="star-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.6 15.09 8.86 22 9.87 17 14.74 18.18 21.62 12 18.37 5.82 21.62 7 14.74 2 9.87 8.91 8.86 12 2.6"/></svg>',
  ban:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="21" x2="12" y2="3"/><polyline points="3 12 12 3 21 12"/></svg>',
  rows:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
};
const HALF_CIRCLE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z" fill="currentColor" stroke="none"/></svg>';
const tbtn=document.getElementById('themeToggle');
tbtn.innerHTML='<span class="tt-ic tt-half">'+HALF_CIRCLE+'</span>';
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  tbtn.setAttribute('data-mode',t);
  tbtn.setAttribute('aria-checked',t==='dark'?'true':'false');
  tbtn.setAttribute('aria-label',t==='dark'?'Switch to light mode':'Switch to dark mode');
  storageSet('theme',t);
}
setTheme(storageGet('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
tbtn.addEventListener('click',()=>setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
(function(){
  const stack=document.getElementById('mastStack');
  if(!stack)return;
  const front=document.getElementById('mastAvatar');
  if(front){front.addEventListener('load',()=>stack.classList.add('show'));front.addEventListener('error',()=>{stack.style.display='none';});}
  stack.querySelectorAll('.mast-avatar').forEach(im=>{im.src='avatars/1.jpg';});
})();
(()=>{
  const bg=document.getElementById('mastBg');
  if(!bg||matchMedia('(max-width:1100px)').matches)return;
  const start=()=>{
  const numbered=(prefix,count)=>Array.from({length:count},(_,index)=>'assets/mast-backgrounds/'+prefix+'-'+String(index+1).padStart(2,'0')+'.webp');
  const cats=['assets/mast-backgrounds/2.webp','assets/mast-backgrounds/3.webp'];
  const portraits=[
    ...numbered('mast-bg-cobalt-botanical',8),
    ...numbered('mast-bg-blue-ink-gold',6),
    ...numbered('mast-bg-sunrise-canopy',3),
    ...numbered('mast-bg-cobalt-canopy',6)
  ];
  const storageKey='mast-background-last';
  const previous=(storageGet(storageKey,true)||'').split('|').filter(Boolean);
  const choose=(pool,avoid)=>{const choices=pool.filter(path=>!avoid.includes(path));return choices[Math.floor(Math.random()*choices.length)]||pool[0];};
  const showCats=Math.random()<cats.length/(cats.length+portraits.length/3);
  const selected=showCats?[choose(cats,previous)]:[];
  if(!showCats)for(let index=0;index<3;index++)selected.push(choose(portraits,[...previous,...selected]));
  const preload=path=>new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.fetchPriority='low';image.onload=()=>resolve(image);image.onerror=reject;image.src=path;});
  const fitGallery=()=>{
    const masthead=bg.closest('.masthead'),eyebrow=masthead?.querySelector('.eyebrow'),stats=masthead?.querySelector('.stats'),stack=masthead?.querySelector('#mastStack');
    if(!masthead||!eyebrow||!stats||!stack)return;
    const textEnd=selector=>{const node=masthead.querySelector(selector);if(!node)return 0;const range=document.createRange();range.selectNodeContents(node);return Math.max(...[...range.getClientRects()].map(rect=>rect.right));};
    const safeTextEnd=Math.max(textEnd('h1'),textEnd('.lede'),textEnd('.tagline'));
    const top=Math.ceil(eyebrow.offsetTop+eyebrow.offsetHeight/2+2),bottom=Math.floor(stats.offsetTop-3),availableHeight=Math.max(1,bottom-top),triptych=bg.classList.contains('triptych'),height=triptych?Math.min(availableHeight,124):availableHeight;
    const stackLeft=stack.getBoundingClientRect().left,mastLeft=masthead.getBoundingClientRect().left,expandedLeft=stackLeft-86,creditReserve=triptych?13:9;
    bg.style.removeProperty('display');bg.style.setProperty('--mast-bg-top',top+'px');bg.style.setProperty('--mast-bg-height',height+'px');
    bg.querySelectorAll('.mast-bg-frame').forEach(frame=>{const image=frame.querySelector('img');if(!image)return;const width=2+(height-2)*(image.naturalWidth/image.naturalHeight);frame.style.width=width.toFixed(3)+'px';});
    bg.style.setProperty('--mast-bg-right',(mastLeft+masthead.clientWidth-(expandedLeft-creditReserve))+'px');
    if(!triptych&&bg.getBoundingClientRect().left<safeTextEnd+5)bg.style.display='none';
  };
  Promise.allSettled(selected.map(preload)).then(results=>{
    const images=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
    if(!images.length){bg.style.display='none';return;}
    const frames=images.map(image=>{image.className='mast-bg-image';image.alt='';image.decoding='async';const frame=document.createElement('span');frame.className='mast-bg-frame';frame.append(image);return frame;});
    if(images.length===3){const credit=document.createElement('span');credit.className='mast-bg-credit';credit.textContent='photo by 小红书@岚岚';bg.replaceChildren(...frames,credit);}else bg.replaceChildren(...frames);
    bg.classList.toggle('triptych',images.length===3);bg.classList.toggle('cat',images.length===1);bg.dataset.background=selected.join('|');fitGallery();bg.classList.add('show');storageSet(storageKey,selected.join('|'),true);
    document.fonts?.ready.then(fitGallery);setTimeout(fitGallery,760);addEventListener('resize',fitGallery,{passive:true});
  }).catch(()=>{bg.style.display='none';});
  };
  // These images are decorative only. Start them after the first data paint so
  // the 4–6 MB gallery cannot compete with jobs-index.json and list rendering.
  document.addEventListener('jobsfilterchange',()=>{requestAnimationFrame(()=>{if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1800});else setTimeout(start,0);});},{once:true});
})();
document.getElementById('totop').innerHTML=IC.up;
document.getElementById('favToggle').innerHTML=IC.star+'<span>收藏</span>';
const dbtn=document.getElementById('densityToggle');
dbtn.innerHTML=IC.rows+'<span>紧凑</span>';
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduce)document.body.classList.add('anim');
const REGIONS={CN:{label:"中国大陆"},HK:{label:"香港"},SG:{label:"新加坡"},OTHER:{label:"其他"}};
const norm=loc=>{const u=(loc||"OTHER").toUpperCase();return REGIONS[u]?u:"OTHER";};
const cityOf=job=>{
  if(norm(job?.location)!=="CN")return "";
  const city=String(job?.city||"").trim();
  if(city)return city;
  const raw=String(job?.locationRaw||"").split(",")[0].trim();
  return raw||"N/A";
};
const companyKey=name=>String(name||"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
const canonicalCompany=name=>{
  const raw=String(name||"").trim(),key=companyKey(raw);
  const aliases={
    jpmorganchase:"JPMorgan Chase",jpmorgan:"JPMorgan Chase",
    bnp:"BNP Paribas",bnpparibas:"BNP Paribas",
    societegenerale:"Societe Generale",
    dbs:"DBS Bank",dbsbank:"DBS Bank",
    deutschebank:"Deutsche Bank",goldmansachs:"Goldman Sachs",
    blackrock:"BlackRock",blackrockassetmanagement:"BlackRock"
  };
  return aliases[key]||raw;
};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function safeJobLink(value){try{const url=new URL(String(value));return url.protocol==="https:"&&(url.hostname==="linkedin.com"||url.hostname.endsWith(".linkedin.com"))?url.href:"#";}catch{return "#";}}
function safeJdHtml(raw){
  const tpl=document.createElement("template");tpl.innerHTML=String(raw||"");
  const allowed=new Set(["DIV","P","UL","OL","LI","STRONG","B","EM","I","BR","H3","H4","SPAN","INS","DEL"]);
  const clean=(node)=>{for(const child of [...node.childNodes]){if(child.nodeType===1){if(!allowed.has(child.tagName)){child.replaceWith(document.createTextNode(child.textContent||""));continue;}[...child.attributes].forEach(a=>child.removeAttribute(a.name));clean(child);}}};
  clean(tpl.content);return tpl.innerHTML||esc(String(raw||""));
}
const jdById=new Map();
// One small, deterministic partition per request; never download the entire JD corpus.
const jdDetailsPromises=new Map();
function jdShard(id){let hash=0;for(const char of String(id))hash=(hash*31+char.charCodeAt(0))>>>0;return (hash%256).toString(16).padStart(2,"0");}
function loadJdDetails(id){
  const shard=jdShard(id);
  if(!jdDetailsPromises.has(shard)){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const promise=fetch(`jd-parts/${shard}.json`,{cache:"no-cache",signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error("Job description HTTP "+r.status);return r.json();})
      .then(doc=>{
        const details=doc&&typeof doc.details==="object"?doc.details:{};
        Object.entries(details).forEach(([key,entry])=>jdById.set(key,entry));
        return jdById;
      }).catch(error=>{jdDetailsPromises.delete(shard);throw error;})
      .finally(()=>clearTimeout(timer));
    jdDetailsPromises.set(shard,promise);
  }
  return jdDetailsPromises.get(shard);
}
const JEV_CACHE_KEY="linkedin-jev-analysis-v5.1.0";
const JEV_TAXONOMY_VERSION="jev-taxonomy-v5.1.0";
const JEV_CACHE_MAX_ENTRIES=400;
// The browser deliberately never receives the JEV secret. A same-origin proxy
// (worker.js) signs the provider request and returns the five-dimension card.
const JEV_API_ENDPOINT="/api/jev/analyze";
function readJevCache(){try{const value=JSON.parse(storageGet(JEV_CACHE_KEY)||"{}");return value&&typeof value==="object"?value:{};}catch{return {};}}
function writeJevCache(value){try{const entries=Object.entries(value);if(entries.length>JEV_CACHE_MAX_ENTRIES){entries.sort((a,b)=>String(b[1]?.analyzedAt||"").localeCompare(String(a[1]?.analyzedAt||"")));value=Object.fromEntries(entries.slice(0,JEV_CACHE_MAX_ENTRIES));}storageSet(JEV_CACHE_KEY,JSON.stringify(value));}catch{}}
async function jdFingerprint(text){if(window.crypto?.subtle){const bytes=new TextEncoder().encode(String(text||""));const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}return String(text||"").slice(0,16000);}
// Block-aware plain text: keeps one line per paragraph / bullet so the worker's fallback cleaner can recognise
// headings and boilerplate paragraphs. (jdPlainText collapses everything onto one line and is only used for display.)
function jdBlockText(html){const tpl=document.createElement("template");tpl.innerHTML=String(html||"").replace(/<li\b[^>]*>/gi,"\n- ").replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|br)\b[^>]*>/gi,"\n");const text=tpl.content.textContent||"";return text.split("\n").map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean).join("\n");}
// v4 request text: the preprocessed jd_text when the build produced one (schema jev-input-v4), otherwise the raw JD.
function jevRequestText(entry){const input=entry?.jevInput;if(input&&input.schema==="jev-input-v4"&&typeof input.jd_text==="string"&&input.jd_text.trim().length>=40)return input.jd_text;return jdBlockText(entry?.descriptionHtml||"")||String(entry?.descriptionText||entry?.description||"");}
function jevRequestData(card,entry){return {jobId:card.dataset.id||"",title:card.querySelector(".job-title")?.textContent||"",company:card.dataset.comp||"",location:card.dataset.region||"",description:jevRequestText(entry).slice(0,JEV_MAX_DESCRIPTION_CHARS),jevInput:jevRequestMeta(entry)};}
function jevRequestMeta(entry){const input=entry?.jevInput;if(!input||input.schema!=="jev-input-v4")return null;return {schema:input.schema,language:input.language||"",evidence_level:input.evidence_level||"",evidence_flags:Array.isArray(input.evidence_flags)?input.evidence_flags:[],employer_metadata:input.employer_metadata||""};}
function jevPayload(raw){const root=raw?.analysis&&typeof raw.analysis==="object"?raw.analysis:raw||{};const dim=(value,fallback)=>value&&typeof value==="object"?value:{value:fallback,label:fallback,confidence:null,state:"not_stated",candidates:[]};return {taxonomyVersion:root.taxonomyVersion||JEV_TAXONOMY_VERSION,model:root.model||"",postingType:root.postingType||{},roleArchetype:dim(root.roleArchetype,"insufficient_evidence"),primaryActivity:dim(root.primaryActivity,"not_determinable"),businessLine:dim(root.businessLine,"not_stated"),leadershipLevel:dim(root.leadershipLevel,"not_stated"),roleRisk:root.roleRisk&&typeof root.roleRisk==="object"?{...root.roleRisk,flags:Array.isArray(root.roleRisk.flags)?root.roleRisk.flags:[],state:root.roleRisk.state||"none"}:{flags:[],state:"none"},evidence:root.evidence||{}};}
const jevText=value=>String(value||"Unknown").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
const jevStateText={low_confidence:"Low confidence",conflicting:"Conflicting evidence",not_applicable:"Not applicable",not_stated:"Evidence incomplete"};
function renderJevResult(container,result,analyzedAt){
  const r=jevPayload(result);
  const sourceNote=evidence=>Array.isArray(evidence)&&evidence[0]?.quote?`<small class="jev-state" title="${esc(evidence[0].quote)}">${evidence[0].source==="title"?"Title":evidence[0].source==="assignment"?"Assignment":"JD"}: “${esc(evidence[0].quote.length>240?evidence[0].quote.slice(0,237)+"…":evidence[0].quote)}”</small>`:"";
  const row=(label,dim,text)=>{
    const state=dim.state||"ok";
    const confidence="";
    const candidates=label==="Business Line"&&dim.value==="not_stated"&&dim.assignedUnits?.length?`<small class="jev-state">Known organisational unit; commercial business line is not established.</small>`:(state==="low_confidence"||state==="conflicting")&&Array.isArray(dim.candidates)&&dim.candidates.length?`<small class="jev-state">${esc(jevStateText[state])} · candidates: ${dim.candidates.slice(0,3).map(c=>esc(c.label||jevText(c.code))).join(" / ")}</small>`:(state!=="ok"?`<small class="jev-state">${esc(jevStateText[state]||jevText(state))}</small>`:"");
    return `<div class="jev-field jev-state-${esc(state)}"><dt>${label}</dt><dd><span>${esc(text)}</span>${confidence}${candidates}${sourceNote(dim.evidence)}${label==="Business Line"&&dim.value==="not_stated"&&dim.assignedUnits?.length?sourceNote(dim.assignedUnits[0].evidence):""}${label==="Primary Activity"&&dim.responsibility?.value!=="not_established"&&dim.responsibility?.evidence?.length?`<small class="jev-state">Responsibility: ${esc(dim.responsibility.label)}${sourceNote(dim.responsibility.evidence)}</small>`:""}${label==="Business Line"&&dim.clientSegment?.value!=="not_established"&&dim.clientSegment?.evidence?.length?`<small class="jev-state">Clients: ${esc(dim.clientSegment.label)}${sourceNote(dim.clientSegment.evidence)}</small>`:""}${label==="Leadership Level"&&dim.value==="individual_contributor"?'<small class="jev-state">Hands-on mandate; direct-report authority is not established.</small>':""}</dd></div>`;
  };
  const a=r.roleArchetype;
  const archetypeText=[a.familyLabel,a.label,a.specialisationLabel].filter(Boolean).join(" · ")||jevText(a.code);
  const risk=r.roleRisk;
  const flags=risk.flags.filter(item=>item.code!=="non_permanent_or_outsourced"||!risk.employment||risk.employment.value==="not_disclosed").map(item=>`<article class="jev-risk jev-risk-${esc(item.severity||"medium")}"><div><strong>${esc(item.label||jevText(item.code))}</strong></div>${item.reason?`<p>${esc(item.reason)}</p>`:""}${sourceNote(item.evidence)}</article>`).join("");
  const employment=["fixed_term","temporary_agency","contractor","secondment"].includes(risk.employment?.value)?`<p class="jev-state"><strong>${esc(risk.employment.label)}${risk.employment.duration?` · ${esc(risk.employment.duration)}`:""}</strong>${sourceNote(risk.employment.evidence)}</p>`:"";
  const obligations=(Array.isArray(risk.constraints)?risk.constraints:[]).map(item=>`<p class="jev-state"><strong>${esc(item.label)}</strong>${sourceNote(item.evidence)}</p>`).join("");
  const questions=(Array.isArray(risk.clarification)?risk.clarification:[]).map(item=>`<p class="jev-state"><strong>${esc(item.label)}</strong></p>`).join("");
  const empty=!flags&&!employment&&!obligations&&!questions?`<small class="jev-state" title="${risk.state==='not_stated'?'Insufficient evidence to complete the assessment':'No material role-specific finding met the evidence threshold; this is not a no-risk guarantee'}">—</small>`:"";
  const riskSection=`<section class="jev-risks"><h4>Role Risk</h4>${employment}${obligations}${flags}${questions}${empty}</section>`;
  container.innerHTML=`<dl class="jev-fields">${row("Role Archetype",a,archetypeText)}${row("Primary Activity",r.primaryActivity,r.primaryActivity.label||jevText(r.primaryActivity.value))}${row("Business Line",r.businessLine,r.businessLine.value==="not_stated"&&r.businessLine.assignedUnits?.length?r.businessLine.assignedUnits.map(x=>x.label).join(" · "):r.businessLine.label||jevText(r.businessLine.value))}${row("Leadership Level",r.leadershipLevel,r.leadershipLevel.label||jevText(r.leadershipLevel.value))}</dl>${riskSection}`;
  container.hidden=false;
}
function jevErrorMessage(status,body){
  const retry=Number(body?.retryAfter)||60;
  if(status===413)return "This job description is too long for analysis.";
  if(status===422)return "The job description is too short or empty to analyse.";
  if(status===429)return `Too many analysis requests (maximum 12 per minute). Please retry in ${retry} seconds.`;
  if(status===403)return "The analysis service rejected this origin. Please retry from the site domain.";
  if(status===402||body?.error==="provider_credits_required")return "JEV analysis is unavailable because the TypeSafe account has no available API credits.";
  if(status===503)return "The analysis service is unavailable or misconfigured.";
  if(status===529||body?.error==="provider_overloaded")return "The model service is busy. Please try again shortly.";
  if(status===504||body?.error==="provider_timeout")return "Analysis timed out. Please retry.";
  if(status===502||body?.error==="provider_error")return "The analysis service returned an error. Please retry.";
  return `Analysis failed (HTTP ${status}${body?.error?` · ${body.error}`:""}).`;
}
function ensureJevPanel(card){
  const body=card.querySelector(".job-jd-text");if(!body||!body.parentNode)return null;
  let tools=body.parentNode.querySelector(".jev-analysis-tools");
  if(!tools){tools=document.createElement("section");tools.className="jev-analysis-tools";tools.innerHTML='<div class="jev-result" hidden></div>';body.parentNode.insertBefore(tools,body);}
  return tools.querySelector(".jev-result");
}
function showJevStatus(panel,message){if(!panel)return;panel.innerHTML=`<p class="jev-status" role="status">${esc(message)}</p>`;panel.hidden=false;}
function showJevError(panel,message,retry){if(!panel)return;panel.innerHTML=`<p class="jev-error" role="alert">${esc(message)}</p>`;if(retry){const button=document.createElement("button");button.type="button";button.className="jev-retry";button.textContent="Retry";button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();retry();});panel.appendChild(button);}panel.hidden=false;}
const JEV_MAX_DESCRIPTION_CHARS=24000;// worker MAX_DESCRIPTION_CHARS; longest real jd_text in the corpus is 14.8k chars
const jevRuns=new Set();
// Every Analytics click goes through here (delegated from the list root), so a click always produces a visible
// state — even before the requested JD partition has finished loading, and even when the request fails.
async function runJevAnalysis(card){
  const id=card?.dataset?.id||"";if(!id||jevRuns.has(id))return;jevRuns.add(id);
  const button=card.querySelector(".job-jd-analytics");
  const details=card.querySelector("details.job-jd");if(details&&!details.open)details.open=true;
  if(button){button.setAttribute("aria-busy","true");button.classList.add("is-loading");}
  let panel=ensureJevPanel(card);
  showJevStatus(panel,"Loading job description…");
  try{
    let entry=jdById.get(id);
    if(!entry){try{await loadJdDetails(id);}catch{}entry=jdById.get(id);}
    if(!entry){showJevError(panel,"Job description could not be loaded. Please try again.",()=>runJevAnalysis(card));return;}
    await hydrateJd(card);panel=ensureJevPanel(card)||panel;
    const text=jevRequestText(entry).slice(0,JEV_MAX_DESCRIPTION_CHARS);
    if(!text||text.trim().length<40){showJevError(panel,"This posting does not contain enough description text to analyse.");return;}
    const requestData=jevRequestData(card,entry),fingerprint=await jdFingerprint(JSON.stringify(requestData)),cache=readJevCache(),record=cache[id];
    if(record?.taxonomyVersion===JEV_TAXONOMY_VERSION&&record.jdFingerprint===fingerprint&&record.result){renderJevResult(panel,record.result,record.analyzedAt);button?.classList.add("is-cached");return;}
    showJevStatus(panel,"JEV is analysing the job description…");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    let response;
    try{response=await fetch(JEV_API_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(requestData),signal:controller.signal});}
    finally{clearTimeout(timer);}
    if(!response.ok){let body=null;try{body=await response.json();}catch{}showJevError(panel,jevErrorMessage(response.status,body),()=>runJevAnalysis(card));return;}
    const payload=await response.json();
    if(!payload?.analysis||payload.analysis.taxonomyVersion!==JEV_TAXONOMY_VERSION)throw new Error("Invalid analysis response");
    const normalized=jevPayload(payload),analyzedAt=new Date().toISOString();
    renderJevResult(panel,normalized,analyzedAt);
    // Cache only after a successful render, so a failure can never poison later clicks.
    if(normalized.taxonomyVersion===JEV_TAXONOMY_VERSION){cache[id]={schemaVersion:3,taxonomyVersion:normalized.taxonomyVersion,jdFingerprint:fingerprint,analyzedAt,result:normalized};writeJevCache(cache);button?.classList.add("is-cached");}
  }catch(error){
    showJevError(panel,error?.name==="AbortError"?"Analysis timed out (45 seconds). Please retry.":"Network error. Could not reach the analysis service. Please retry.",()=>runJevAnalysis(card));
  }finally{if(button){button.removeAttribute("aria-busy");button.classList.remove("is-loading");}jevRuns.delete(id);}
}
function addJevControls(body,card,entry){
  if(window.matchMedia?.("(max-width:720px)").matches)return;
  const panel=ensureJevPanel(card);if(!panel||panel.dataset.cachedChecked==="true")return;panel.dataset.cachedChecked="true";
  const id=card.dataset.id||"",existing=readJevCache()[id];
  if(existing?.taxonomyVersion===JEV_TAXONOMY_VERSION&&existing?.result){jdFingerprint(JSON.stringify(jevRequestData(card,entry))).then(fingerprint=>{if(existing.jdFingerprint===fingerprint&&panel.hidden){renderJevResult(panel,existing.result,existing.analyzedAt);card.querySelector(".job-jd-analytics")?.classList.add("is-cached");}});}
}
async function hydrateJd(card){
  const body=card.querySelector(".job-jd-text");
  if(!body||body.dataset.loaded==="true")return;
  if(body.dataset.loading==="true")return;
  body.dataset.loading="true";
  const summary=card.querySelector("details.job-jd summary");
  let status=summary?.querySelector(".job-jd-status");
  if(summary&&!status){status=document.createElement("span");status.className="job-jd-status";status.setAttribute("role","status");summary.appendChild(status);}
  if(status){status.hidden=false;status.textContent="Loading job description…";body.textContent="";}
  else body.textContent="Loading job description…";
  let entry=jdById.get(card.dataset.id);
  if(!entry){try{await loadJdDetails(card.dataset.id);entry=jdById.get(card.dataset.id);}catch(e){body.textContent="Job description could not be loaded. Please try again.";}}
  if(!entry){if(status)status.hidden=true;body.textContent="Job description could not be loaded. Please try again.";delete body.dataset.loading;return;}
  if(status)status.hidden=true;
  const html=entry.descriptionHtml||"",text=entry.descriptionText||entry.description||jdPlainText(html);
  const current=html?safeJdHtml(html):esc(text).replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  const tracked=entry.jdDiffHtml?safeJdHtml(entry.jdDiffHtml):"";
  // Render one Word-like mixed revision: deleted source text remains visible
  // with <del>, while inserted text appears inline with <ins>. Do not append
  // a legend, explanatory copy, or a second "current version" block.
  body.innerHTML=tracked||current;
  addJevControls(body,card,entry);
  body.dataset.loaded="true";
  delete body.dataset.loading;
}
const monogram=n=>{const t=(n||"?").trim();return t?t[0].toUpperCase():"?";};
const jobId=link=>{
  if(!link)return"";
  const raw=String(link),path=raw.split(/[?#]/)[0],view=path.match(/\/jobs\/view\/([^/]+)\/?$/i),
    slugMatches=view?.[1].match(/\d{7,}/g),query=raw.match(/[?&]currentJobId=(\d+)/);
  const id=slugMatches?.at(-1)||query?.[1];
  return id?("ln:"+id):path.replace(/\/+$/i,"");
};
const keyOf=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dayKey=iso=>{const d=new Date(iso);return isNaN(d)?"—":keyOf(d);};
const dayLabel=iso=>{const d=new Date(iso);return isNaN(d)?"未知日期":d.toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"});};
const isActiveJob=job=>job?.jobStatus!=="expired";
const seenAt=j=>j.firstSeen||j.pushTime;
const validDays=(start,end)=>{const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;return Math.max(0,Math.floor((b-a)/864e5));};
// pushTime is advanced only by JobSpy-confirmed same-day reposts; RSS merely
// observes existing listings and must not move them to the top of the list.
const placeAt=j=>j.pushTime||j.firstSeen;
// Within one exact update batch, keep the requested editorial region order.
// The timestamp remains the primary key, so a later batch always stays above
// every earlier batch regardless of region.
const displayRegionRank={CN:0,HK:1,SG:2,OTHER:3};
const displayRegionOf=j=>norm(j?.location);
const displayRegionTieBreak=(a,b)=>(displayRegionRank[displayRegionOf(a)]??9)-(displayRegionRank[displayRegionOf(b)]??9);
const ageDays=iso=>{const d=new Date(iso);if(isNaN(d))return null;return Math.max(0,Math.floor((Date.now()-d)/864e5));};
const ageMatch=(sel,d)=>{if(sel==="all")return true;if(d==null)return false;if(sel==="22+")return d>=22;const p=sel.split("-").map(Number);return p[1]==null?d===p[0]:(d>=p[0]&&d<=p[1]);};
function levelOf(t){t=(t||"").toLowerCase();if(/\bintern(s|ship)?\b/.test(t)||/实习/.test(t))return"Intern";if(/\b(md|managing director|director|head of)\b/.test(t)||/总监|主管/.test(t))return"Director+";if(/\b(vp|svp|evp|vice president)\b/.test(t)||/副总裁/.test(t))return"VP";if(/associate/.test(t)||/经理/.test(t))return"Associate";if(/analyst/.test(t)||/分析师|专员/.test(t))return"Analyst";return"Other";}
function animNum(el,target,suffix){suffix=suffix||"";if(reduce){el.innerHTML=target.toLocaleString()+suffix;return;}const dur=420,start=performance.now();const step=now=>{const p=Math.min((now-start)/dur,1),e=1-Math.pow(1-p,3);el.innerHTML=Math.round(target*e).toLocaleString()+suffix;if(p<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
const favs=new Set(storageList("favs"));
const reads=new Set(storageList("reads"));
const blocked=new Set(storageList("blocked"));
const blockedKw=new Set(storageList("blockedKw"));
const saveFavs=()=>storageSet("favs",JSON.stringify([...favs]));
const saveReads=()=>storageSet("reads",JSON.stringify([...reads]));
const saveBlocked=()=>storageSet("blocked",JSON.stringify([...blocked]));
const saveBlockedKw=()=>storageSet("blockedKw",JSON.stringify([...blockedKw]));
// Remote changes update the existing state and row rendering; no new row layout.
let accountPreferenceFrame=0;
addEventListener('account-preferences',()=>{
  cancelAnimationFrame(accountPreferenceFrame);
  accountPreferenceFrame=requestAnimationFrame(()=>{
    const lists=window.AccountPreferences.snapshot();
    for(const [key,set] of [['favs',favs],['reads',reads],['blocked',blocked],['blockedKw',blockedKw]]){set.clear();for(const value of lists[key])set.add(value);}
    if(typeof renderReady!=='undefined'&&renderReady){
      for(const card of jobCards){const favorite=favs.has(card.dataset.id);card.classList.toggle('read',reads.has(card.dataset.id));card.classList.toggle('is-favorite',favorite);card.querySelectorAll('.star').forEach(button=>{button.classList.toggle('on',favorite);button.classList.toggle('is-favorite',favorite);button.title=favorite?'取消收藏':'收藏';button.setAttribute('aria-pressed',String(favorite));button.setAttribute('aria-label',button.title);});}
      for(const section of daySections)if(section._jobCards)section._favoriteCards=new Set(section._jobCards.filter(card=>favs.has(card.dataset.id)));
      renderBlocked();renderKw();apply();
    }
  });
});

(function(){const values=[...blocked];blocked.clear();values.forEach(value=>blocked.add(canonicalCompany(value)));saveBlocked();})();
(function(){if(storageGet("favKeyV")==="2")return;[favs,reads].forEach(set=>{const arr=[...set];set.clear();arr.forEach(k=>set.add(jobId(k)));});saveFavs();saveReads();storageSet("favKeyV","2");})();
const jobsEl=document.getElementById("jobs"),emptyEl=document.getElementById("empty"),searchEl=document.getElementById("search"),companyEl=document.getElementById("company"),ageEl=document.getElementById("age"),cityEl=document.getElementById("city"),regionsEl=document.getElementById("regions"),favEl=document.getElementById("favToggle"),countEl=document.getElementById("count"),blockedBar=document.getElementById("blockedBar"),compClear=document.getElementById("compClear");
// `toggle` does not bubble, so capture it at the list root. The initial
// index payload intentionally excludes JD text; only opening a details row
// fetches a small JD partition and hydrates that one card.
jobsEl.addEventListener("toggle",event=>{
  const details=event.target;
  if(details instanceof HTMLDetailsElement&&details.matches("details.job-jd")){
    const analytics=details.querySelector(".job-jd-analytics");
    if(analytics)analytics.hidden=!details.open;
    if(details.open)hydrateJd(details.closest(".job"));
  }
},true);
compClear.addEventListener("click",()=>{companyEl.value="all";apply();});
jobsEl.addEventListener("keydown",e=>{
  if(e.key!=="Enter"&&e.key!==" ")return;
  const button=e.target.closest?.(".job-jd-analytics");
  if(!button||!jobsEl.contains(button))return;
  e.preventDefault();e.stopPropagation();runJevAnalysis(button.closest(".job"));
},true);
jobsEl.addEventListener("click",e=>{
  const card=e.target.closest(".job");if(!card||!jobsEl.contains(card))return;
  const id=card.dataset.id;
  if(e.target.closest(".job-jd-analytics")){e.preventDefault();e.stopPropagation();runJevAnalysis(card);return;}
  if(e.target.closest(".job-jd-toggle")){hydrateJd(card);return;}
  if(e.target.closest(".job-title")){reads.add(id);saveReads();card.classList.add("read");return;}
  const star=e.target.closest(".star");
  if(star){e.preventDefault();const isFavorite=!favs.has(id);if(isFavorite)favs.add(id);else favs.delete(id);card.classList.toggle("is-favorite",isFavorite);card.querySelectorAll(".star").forEach(button=>{button.classList.toggle("on",isFavorite);button.classList.toggle("is-favorite",isFavorite);button.title=isFavorite?"取消收藏":"收藏";button.setAttribute("aria-pressed",String(isFavorite));button.setAttribute("aria-label",button.title);});const section=card.closest(".day");if(section?._favoriteCards){if(isFavorite)section._favoriteCards.add(card);else section._favoriteCards.delete(card);}saveFavs();if(favOnly)refreshFavoriteFilterView();return;}
  const ban=e.target.closest(".ban");
  if(ban){e.preventDefault();const c=card.dataset.comp;if(c){if(blocked.has(c))blocked.delete(c);else blocked.add(c);saveBlocked();renderBlocked();apply();}return;}
  const sub=e.target.closest(".job-sub-link");
  if(sub){e.preventDefault();e.stopPropagation();const c=card.dataset.comp;if(c){companyEl.value=c;apply();const tb=document.querySelector(".toolbar");if(tb)tb.scrollIntoView({behavior:"smooth",block:"start"});}}
});
jobsEl.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const sub=e.target.closest(".job-sub-link");if(!sub)return;e.preventDefault();const card=sub.closest(".job"),c=card?.dataset.comp;if(c){companyEl.value=c;apply();const tb=document.querySelector(".toolbar");if(tb)tb.scrollIntoView({behavior:"smooth",block:"start"});}});
const kwToggle=document.getElementById("kwToggle"),kwPanel=document.getElementById("kwPanel"),kwForm=document.getElementById("kwForm"),kwInput=document.getElementById("kwInput"),kwList=document.getElementById("kwList");
let activeRegion="all",activeCity="all",activeOnly=false,favOnly=false,blockedOpen=false,simpleFilterActive=true,renderReady=false;
let daySections=[],jobCards=[],filteredCards=new Set(),loadedJobs=null;
let listRuntime=null;
const regionActiveTotals={CN:0,HK:0,SG:0,OTHER:0};
// Bind controls before fetching/rendering the list; keep choices made during loading.
favEl.addEventListener("click",()=>{favOnly=!favOnly;favEl.classList.toggle("active",favOnly);refreshFavoriteFilterView();});
let _searchTimer=null, _searchFrame=0, _composing=false;
searchEl.addEventListener("compositionstart",()=>{_composing=true;clearTimeout(_searchTimer);cancelAnimationFrame(_searchFrame);});
searchEl.addEventListener("compositionend",()=>{_composing=false;searchEl.dispatchEvent(new Event("input"));});
searchEl.addEventListener("input",event=>{
  if(_composing||event.isComposing)return;
  clearTimeout(_searchTimer);
  cancelAnimationFrame(_searchFrame);
  _searchTimer=setTimeout(()=>{_searchFrame=requestAnimationFrame(()=>{_searchFrame=0;apply();});},180);
});
companyEl.addEventListener("change",apply);
ageEl.addEventListener("change",apply);
cityEl.addEventListener("change",()=>{
  activeCity=cityEl.value;
  if(activeCity==="OTHER"){
    regionsEl.querySelectorAll(".seg").forEach(x=>{x.classList.remove("active");x.setAttribute("aria-selected","false");});
    activeRegion="OTHER";
  }else if(activeCity!=="all"){
    const cn=regionsEl.querySelector('.seg[data-region="CN"]');
    regionsEl.querySelectorAll(".seg").forEach(x=>{x.classList.toggle("active",x===cn);x.setAttribute("aria-selected",x===cn?"true":"false");});
    activeRegion="CN";
  }
  apply();
});

const setRegion=region=>{
  const b=regionsEl.querySelector('.seg[data-region="'+region+'"]');if(!b)return;
    regionsEl.querySelectorAll(".seg").forEach(x=>{x.classList.remove("active");x.setAttribute("aria-selected","false");});
    b.classList.add("active");b.setAttribute("aria-selected","true");activeRegion=region;
    if(region!=="CN"){activeCity="all";cityEl.value="all";}
    regionsEl.dataset.pendingRegion=region;
    apply();
  };
  regionsEl.addEventListener("click",e=>{const b=e.target.closest(".seg");if(b)setRegion(b.dataset.region);});
  regionsEl.addEventListener("keydown",e=>{
    const current=e.target.closest(".seg");if(!current)return;
    const tabs=[...regionsEl.querySelectorAll(".seg")];let next=null;
    if(e.key==="ArrowRight")next=tabs[(tabs.indexOf(current)+1)%tabs.length];
    else if(e.key==="ArrowLeft")next=tabs[(tabs.indexOf(current)-1+tabs.length)%tabs.length];
    else if(e.key==="Home")next=tabs[0];
    else if(e.key==="End")next=tabs[tabs.length-1];
    if(!next)return;e.preventDefault();next.focus();setRegion(next.dataset.region);
  });
let top50Mode="all",top50Rows=[];
const top50Tabs=document.getElementById("top50Tabs"),top50Title=document.getElementById("top50Title");
function updateTop50Slider(mode){
  if(!top50Tabs)return;
  const colors={all:'rgba(107,106,101,.14)',CN:'rgba(156,42,51,.18)',HK:'rgba(176,124,34,.20)',SG:'rgba(110,138,70,.20)'};
  const offsets={all:0,CN:100,HK:200,SG:300};
  top50Tabs.style.setProperty('--top50-slider-color',colors[mode]||colors.all);
  top50Tabs.style.setProperty('--top50-slider-x',(offsets[mode]??0)+'%');
}
if(top50Tabs){top50Tabs.dataset.active=top50Mode;updateTop50Slider(top50Mode);}
function setTop50Mode(mode){
  top50Mode=mode;
  if(top50Tabs){top50Tabs.dataset.active=mode;updateTop50Slider(mode);}
  top50Tabs?.querySelectorAll(".top50-tab").forEach(b=>{const active=b.dataset.topRegion===mode;b.classList.toggle("active",active);b.setAttribute("aria-selected",active?"true":"false");});
  if(top50Title)top50Title.textContent="Top 30 Institutions by Active Roles: Who Is Hiring and Where?";
  if(top50Rows.length)renderTop50(top50Rows,top50Mode);
}
top50Tabs?.addEventListener("click",e=>{const b=e.target.closest(".top50-tab");if(b)setTop50Mode(b.dataset.topRegion);});
top50Tabs?.addEventListener("keydown",e=>{
  const current=e.target.closest(".top50-tab");if(!current)return;
  const tabs=[...top50Tabs.querySelectorAll(".top50-tab")];let next=null;
  if(e.key==="ArrowRight")next=tabs[(tabs.indexOf(current)+1)%tabs.length];
  else if(e.key==="ArrowLeft")next=tabs[(tabs.indexOf(current)-1+tabs.length)%tabs.length];
  else if(e.key==="Home")next=tabs[0];
  else if(e.key==="End")next=tabs[tabs.length-1];
  if(!next)return;e.preventDefault();next.focus();setTop50Mode(next.dataset.topRegion);
});
const top50Host=document.getElementById("top50");
function drillTop50Company(company){
  const name=String(company||"").trim();
  if(!name||![...companyEl.options].some(option=>option.value===name))return;
  companyEl.value=name;
  apply();
  const toolbar=document.querySelector(".toolbar");
  requestAnimationFrame(()=>toolbar?.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"}));
}
top50Host?.addEventListener("click",e=>{
  const row=e.target.closest(".bubble-row[data-company]");
  if(row&&top50Host.contains(row))drillTop50Company(row.dataset.company);
});
top50Host?.addEventListener("keydown",e=>{
  if(e.key!=="Enter"&&e.key!==" ")return;
  const row=e.target.closest(".bubble-row[data-company]");
  if(!row||!top50Host.contains(row))return;
  e.preventDefault();
  drillTop50Company(row.dataset.company);
});
function setDensity(d){
  const anchor=jobsEl?._jobView?.capture();
  const c=d==="compact";
  document.body.classList.toggle("compact",c);
  dbtn.classList.toggle("active",c);
  storageSet("density",d);
  jobsEl?._jobView?.invalidate(anchor);
}
setDensity(storageGet("density")||"comfortable");
dbtn.addEventListener("click",()=>setDensity(document.body.classList.contains("compact")?"comfortable":"compact"));
function renderBlocked(){
  if(blocked.size===0){blockedBar.classList.remove("show","open");blockedBar.innerHTML="";blockedOpen=false;return;}
  blockedBar.classList.add("show");blockedBar.classList.toggle("open",blockedOpen);
  blockedBar.innerHTML='<button class="bl-toggle" id="blToggle">已屏蔽机构 ('+blocked.size+') <span class="bl-caret">'+IC.chevron+'</span></button><div class="bl-list">'+[...blocked].map(c=>'<span class="bl-chip">'+esc(c)+'<button data-c="'+esc(c)+'" aria-label="取消屏蔽">'+IC.x+'</button></span>').join('')+'<button class="bl-clear" id="blClear">全部清除</button></div>';
}
blockedBar.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="blToggle"){blockedOpen=!blockedOpen;blockedBar.classList.toggle("open",blockedOpen);return;}if(b.id==="blClear"){blocked.clear();}else if(b.dataset.c!=null){blocked.delete(b.dataset.c);}saveBlocked();renderBlocked();apply();});
renderBlocked();
function renderKw(){
  kwToggle.classList.toggle("active",blockedKw.size>0);
  kwToggle.innerHTML=IC.ban+'<span>屏蔽词'+(blockedKw.size?' ('+blockedKw.size+')':'')+'</span>';
  if(!blockedKw.size){kwList.innerHTML='<span class="kw-empty">暂无屏蔽词，添加后标题包含该词的职位会被隐藏（不区分大小写）。</span>';return;}
  kwList.innerHTML=[...blockedKw].map(k=>'<span class="bl-chip">'+esc(k)+'<button type="button" data-k="'+esc(k)+'" aria-label="移除屏蔽词">'+IC.x+'</button></span>').join('')+'<button type="button" class="bl-clear" id="kwClear">全部清除</button>';
}
kwToggle.addEventListener("click",()=>{kwPanel.classList.toggle("open");if(kwPanel.classList.contains("open"))kwInput.focus();});
kwForm.addEventListener("submit",e=>{e.preventDefault();const v=kwInput.value.trim().toLowerCase();if(!v)return;blockedKw.add(v);saveBlockedKw();kwInput.value="";renderKw();apply();});
kwList.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="kwClear"){blockedKw.clear();}else if(b.dataset.k!=null){blockedKw.delete(b.dataset.k);}saveBlockedKw();renderKw();apply();});
renderKw();
const keepLatestSameCityTitle=data=>{
  // The canonical pipeline already deduplicates by LinkedIn job ID.  Never
  // merge separate jobs merely because city, company and title are equal:
  // one company can legitimately have several requisitions in one city.
  const selected=new Map(),others=[];
  data.forEach(job=>{
    const key=jobId(job.link);
    if(!key){others.push(job);return;}
    const time=Date.parse(job.pushTime||job.firstSeen||"")||0,previous=selected.get(key);
    const shouldReplace=!previous||(!isActiveJob(previous.job)&&isActiveJob(job))||(isActiveJob(job)===isActiveJob(previous.job)&&time>previous.time);
    if(shouldReplace)selected.set(key,{job,time});
  });
  return [...others,...[...selected.values()].map(entry=>entry.job)];
};
function renderTop50(rows,mode="all"){
  const host=document.getElementById('top50');
  if(!host)return;
  const now=Date.now();
  const scoped=(mode==="all"?rows:rows.filter(j=>norm(j.location)===mode)).filter(isActiveJob);
  const counts=new Map();
  scoped.forEach(j=>{
    const name=canonicalCompany(j.company||'未知机构')||'未知机构';
    if(!name)return;
    if(!counts.has(name))counts.set(name,{total:0,CN:0,HK:0,SG:0,ages:[]});
    const item=counts.get(name);
    item.total++;
    const region=norm(j.location);
    if(item[region]!=null)item[region]++;
    const seen=Date.parse(j.firstSeen||'');
    if(Number.isFinite(seen))item.ages.push(Math.max(0,(now-seen)/86400000));
  });
  const top=[...counts.entries()].filter(([,d])=>d.ages.length).sort((a,b)=>b[1].total-a[1].total||a[0].localeCompare(b[0],'zh-Hans-CN')).slice(0,30);
  const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const companyLabel=name=>{const short=String(name||'').trim().split(/\s+/).slice(0,6).join(' ');return short.length>30?short.slice(0,29)+'…':short;};
  const W=720,H=570,left=54,plotRight=666,plotTop=32,plotBottom=528;
  const labelWidth=s=>[...String(s||'')].reduce((w,ch)=>w+(ch.charCodeAt(0)>255?7.5:4.45),0);
  const means=top.map(([,d])=>d.ages.reduce((a,b)=>a+b,0)/d.ages.length);
  const medians=top.map(([,d])=>{const a=[...d.ages].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;});
  const maxValue=Math.max(0,...means,...medians);
  const domainMax=Math.max(50,Math.ceil(maxValue/10)*10);
  const x=v=>left+(plotRight-left)*((Number(v)||0)/domainMax);
  const y=v=>plotBottom-(plotBottom-plotTop)*((Number(v)||0)/domainMax);
  const xTicks=Array.from({length:domainMax/10+1},(_,i)=>i*10);
  const yTicks=Array.from({length:domainMax/10+1},(_,i)=>i*10);
  const grid=xTicks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+x(v).toFixed(1)+'" y1="'+plotTop+'" x2="'+x(v).toFixed(1)+'" y2="'+plotBottom+'"/>')+'<text class="bubble-axis" x="'+x(v).toFixed(1)+'" y="'+(plotBottom+17)+'" text-anchor="middle">'+v+'</text>').join('')+
    yTicks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+left+'" y1="'+y(v).toFixed(1)+'" x2="'+plotRight+'" y2="'+y(v).toFixed(1)+'"/>')+'<text class="bubble-axis" x="'+(left-10)+'" y="'+(y(v)+3).toFixed(1)+'" text-anchor="end">'+v+'</text>').join('');
  const pointData=top.map(([name,item],i)=>{
    const ages=[...item.ages].sort((a,b)=>a-b),n=ages.length;
    const mean=ages.reduce((a,b)=>a+b,0)/n;
    const median=n%2?ages[(n-1)/2]:(ages[n/2-1]+ages[n/2])/2;
    const tier=Math.min(5,Math.floor(i/5));
    const palette=['#F5572F','#D4A017','#ACAD79','#7096D1','#334EAC','#081F5C'];
    const gray=palette[tier],labelInk=tier>=4?'#1C1C1A':'#F0EFEB',deepTone=tier>=4;
    const r=3+Math.sqrt(item.total/Math.max(1,top[0][1].total))*8.2,label=companyLabel(name);
    return {name,item,i,mean,median,gray,labelInk,deepTone,r,px:x(mean),py:y(median),label,labelW:labelWidth(label)};
  });
  const occupied=[];
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const bubbleDistance=(box,q)=>{const nearX=Math.max(box.x,Math.min(q.px,box.x+box.w)),nearY=Math.max(box.y,Math.min(q.py,box.y+box.h));return Math.hypot(q.px-nearX,q.py-nearY);};
  const boxDistance=(a,b)=>{const dx=Math.max(b.x-a.x-a.w,a.x-b.x-b.w,0),dy=Math.max(b.y-a.y-a.h,a.y-b.y-b.h,0);return Math.hypot(dx,dy);};
  const segmentDistance=(point,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,scale=dx*dx+dy*dy;if(!scale)return Math.hypot(point.x-a.x,point.y-a.y);const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/scale));return Math.hypot(point.x-(a.x+t*dx),point.y-(a.y+t*dy));};
  const hitsBubble=(box,p)=>pointData.some(q=>q!==p&&bubbleDistance(box,q)<q.r+2);
  // Larger bubbles reserve space first; every company then evaluates left, right, above and below on exactly the same terms.
  [...pointData].sort((a,b)=>b.r-a.r||a.py-b.py).forEach(p=>{
    const shifts=[0,-9,9,-18,18,-28,28,-40,40,-54,54,-70,70,-88,88,-108,108];
    const candidates=[];
    const addCandidate=(placement,offset,index,nudge=0,bias=0)=>{
      const local=placement==='right'||placement==='left';
      // Text boxes start 6 viewBox units from the bubble on every cardinal side before any collision-avoidance shift.
      const baseline=Math.max(plotTop+8,Math.min(plotBottom-5,local?p.py+offset:(placement==='below'?p.py+p.r+13+offset:p.py-p.r-10-offset)));
      const anchor=local?'start':'middle';
      const lx=placement==='right'?p.px+p.r+6:placement==='left'?p.px-p.r-6-p.labelW:p.px+nudge;
      const box={x:anchor==='middle'?lx-p.labelW/2:lx,y:baseline-7,w:p.labelW,h:11};
      if(box.x<left+4||box.x+box.w>plotRight-4)return;
      const ownBubbleCollision=bubbleDistance(box,p)<p.r+2;
      const collision=occupied.filter(other=>overlaps(box,other)).length+(hitsBubble(box,p)?1:0)+(ownBubbleCollision?1:0);
      const edgeDistance=Math.max(0,bubbleDistance(box,p)-p.r);
      const nearestBubbleClearance=Math.min(...pointData.filter(q=>q!==p).map(q=>bubbleDistance(box,q)-q.r));
      const nearestLabelClearance=occupied.length?Math.min(...occupied.map(other=>boxDistance(box,other))):Infinity;
      const localClearance=Math.min(nearestBubbleClearance,nearestLabelClearance);
      // Leaders only clarify genuine separation; a close left-side label is equally valid.
      const leader=collision>0||edgeDistance>9;
      const labelLeft=anchor==='middle'?lx-p.labelW/2:lx;
      const lineX=placement==='right'?labelLeft-2:placement==='left'?labelLeft+p.labelW+2:lx;
      const start={x:p.px,y:p.py},end={x:lineX,y:baseline};
      const routeLength=route=>route.slice(1).reduce((sum,point,idx)=>sum+Math.hypot(point.x-route[idx].x,point.y-route[idx].y),0);
      const routeClear=route=>!pointData.some(q=>q!==p&&route.slice(1).some((point,idx)=>segmentDistance({x:q.px,y:q.py},route[idx],point)<q.r+1.5));
      // A leader may be direct or make one quiet 90° turn; diagram-spanning detours are visually worse than choosing another label position.
      const routes=[[start,end],[start,{x:start.x,y:end.y},end],[start,{x:end.x,y:start.y},end]];
      const route=leader?routes.filter(routeClear).sort((a,b)=>routeLength(a)-routeLength(b))[0]||null:[];
      const routeLengthPenalty=route?routeLength(route)*1.25:0;
      const crossedBubble=leader&&!route;
      // Keep labels beside their own bubble first. Association clearance only resolves nearby candidates, never justifies a much longer label displacement.
      const associationDeficit=Math.max(0,edgeDistance+1.5-nearestBubbleClearance);
      const crowdingPenalty=Math.max(0,18-localClearance)*.35;
      const remotePenalty=Math.max(0,edgeDistance-9)*18;
      candidates.push({x:lx,y:baseline,w:p.labelW,h:8,anchor,placement,collision,leader,route,edgeDistance,cost:collision*1000000+crossedBubble*100000+remotePenalty+routeLengthPenalty+edgeDistance+associationDeficit*1.2+crowdingPenalty+bias});
    };
    // Rotate only exact ties by company name, so candidate enumeration never introduces a global right-side preference.
    const directions=['right','below','left','above'],rotation=[...p.name].reduce((sum,ch)=>sum+ch.codePointAt(0),0)%directions.length;
    directions.map((_,index)=>directions[(index+rotation)%directions.length]).forEach(placement=>shifts.forEach((shift,index)=>addCandidate(placement,shift,index)));
    const best=candidates.sort((a,b)=>a.cost-b.cost)[0]||{x:Math.max(left+4,Math.min(plotRight-p.labelW-4,p.px+7)),y:Math.max(plotTop+8,Math.min(plotBottom-5,p.py)),w:p.labelW,h:8,anchor:'start',placement:'right',leader:true};
    p.labelBox=best;occupied.push({x:(best.anchor==='middle'?best.x-best.w/2:best.x)-2,y:best.y-7.5,w:best.w+4,h:12.5});
  });
  const points=pointData.map((p)=>{
    const {name,item,i,mean,median,gray,labelInk,deepTone,r,px,py,label,labelBox}=p;
    const labelLeft=labelBox.anchor==='middle'?labelBox.x-labelBox.w/2:labelBox.x;
    const title=escSvg(name)+' · '+item.total+' 个职位 · 平均 '+mean.toFixed(1)+' 天 · 中位 '+median.toFixed(1)+' 天';
    const leader=labelBox.leader&&labelBox.route?'<polyline class="bubble-label-leader" fill="none" points="'+labelBox.route.map(point=>point.x.toFixed(1)+','+point.y.toFixed(1)).join(' ')+'"/>':'';
    return '<g class="bubble-row bubble-drill" data-company="'+escSvg(name)+'" data-total="'+item.total+'" data-mean="'+mean.toFixed(2)+'" data-median="'+median.toFixed(2)+'" style="--i:'+i+'" role="button" tabindex="0" aria-label="查看 '+escSvg(name)+' 的职位">'+leader+'<rect class="bubble-hit" x="'+(labelLeft-2).toFixed(1)+'" y="'+(labelBox.y-7).toFixed(1)+'" width="'+(labelBox.w+4).toFixed(1)+'" height="10" rx="2"/><circle class="bubble-point" cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+gray+'"><title>'+title+'</title></circle><text class="bubble-company" x="'+labelBox.x.toFixed(1)+'" y="'+labelBox.y.toFixed(1)+'" text-anchor="'+labelBox.anchor+'">'+escSvg(label)+'</text><text class="bubble-total'+(deepTone?' bubble-total-deep':'')+'" fill="'+labelInk+'" x="'+px.toFixed(1)+'" y="'+(py+2.5).toFixed(1)+'" text-anchor="middle">'+item.total+'</text></g>';
  }).join('');
  const diagonal='<line class="bubble-diagonal" x1="'+x(0)+'" y1="'+y(0)+'" x2="'+x(domainMax)+'" y2="'+y(domainMax)+'"/><text class="bubble-relation bubble-relation-above" x="'+x(7)+'" y="'+y(11)+'" text-anchor="middle">MEDIAN &gt; AVERAGE</text><text class="bubble-relation bubble-relation-below" x="'+x(7)+'" y="'+y(4)+'" text-anchor="middle">AVERAGE &gt; MEDIAN</text>';
  host.innerHTML='<svg class="top20-svg bubble-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Top 30 机构平均 first seen 天数、中位数与职位数量彩色气泡图">'+grid+diagonal+'<text class="bubble-x-title" x="'+((left+plotRight)/2)+'" y="'+(H-1)+'" text-anchor="middle">AVG DAYS SINCE FIRST SEEN</text><text class="bubble-y-title" x="31" y="'+((plotTop+plotBottom)/2)+'" text-anchor="middle" transform="rotate(-90 31 '+((plotTop+plotBottom)/2)+')">MEDIAN DAYS</text>'+points+'</svg>';
  requestAnimationFrame(()=>host.classList.add('is-ready'));
}
const jdPlainText=html=>String(html||"").replace(/<br\s*\/?>/gi," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
jobsEl.innerHTML=Array.from({length:6}).map(()=>'<div class="sk"><div class="sk-box sk-mono"></div><div><div class="sk-box sk-l1"></div><div class="sk-box sk-l2"></div></div></div>').join("");
// Allow a slow but progressing transfer; abort idle connections and cap total time.
async function fetchJobsIndex({attemptTimeouts=[45000,15000],idleTimeout=20000,connectTimeout=10000,retryDelay=350}={}){
  let lastError;
  for(let attempt=0;attempt<attemptTimeouts.length;attempt++){
    const controller=new AbortController();
    let timer,idleTimer,connectTimer,armIdle;
    const timeout=new Promise((_,reject)=>{
      const fail=()=>{controller.abort();reject(new Error("jobs-index.json timeout"));};
      timer=setTimeout(fail,attemptTimeouts[attempt]);
      // Fail an unresponsive connection promptly, while allowing a progressing
      // download to finish within the separate overall attempt budget.
      connectTimer=setTimeout(fail,connectTimeout);
      armIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(fail,idleTimeout);};
    });
    try{
      return await Promise.race([
        (async()=>{
          const response=await fetch(document.documentElement.dataset.authState==='guest'?"/api/public-preview":"jobs-index.json",{cache:"no-cache",signal:controller.signal});
          clearTimeout(connectTimer);
          if(!response.ok)throw Object.assign(new Error("jobs-index.json HTTP "+response.status),{status:response.status});
          armIdle();
          if(!response.body?.getReader)return response.json();
          const reader=response.body.getReader(),decoder=new TextDecoder();
          let text="";
          try{
            while(true){
              const {done,value}=await reader.read();
              if(done)break;
              if(value?.byteLength){armIdle();text+=decoder.decode(value,{stream:true});}
            }
            return JSON.parse(text+decoder.decode());
          }finally{reader.releaseLock();}
        })(),
        timeout,
      ]);
    }catch(error){
      lastError=error;
      if(error.status===401||error.status===403||error.status===404)throw error;
    }finally{clearTimeout(timer);clearTimeout(idleTimer);clearTimeout(connectTimer);}
    if(attempt+1<attemptTimeouts.length)await new Promise(resolve=>setTimeout(resolve,retryDelay));
  }
  throw lastError;
}
// Keep conditional cache validation so repeat visits can reuse the browser's copy.
const jobsDataPromise=(window.JobIndexStore&&document.documentElement.dataset.authState!=='guest'?window.JobIndexStore.load(fetchJobsIndex):fetchJobsIndex())
  .then(data=>{window.AuthGuest?.setOverview(data);window.CompanyLogos?.setManifest(data?.companyLogos,data?.companyLogoFallback);const rows=Array.isArray(data)?data:(Array.isArray(data?.jobs)?data.jobs:[]);rows.forEach(job=>{const company=canonicalCompany(job.company);if(company!==job.company)job.company=company;});return rows;});
window.__jobsDataPromise=jobsDataPromise;
jobsDataPromise
  .then(async data=>{
    if(!Array.isArray(data))data=[];
    // Use the deduplicated dataset as the single source for rendering and every statistic.
    data=keepLatestSameCityTitle(data);
    loadedJobs=data;
    updateJobCount(countLoadedActiveJobs());
    // Paint the accurate count before charts and thousands of cards are built.
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    await new Promise(resolve=>setTimeout(resolve,0));
    const activeData=data.filter(isActiveJob);
    const chartData=window.AuthGuest?.chartRows||activeData;
    const companyRegionCount=new Map();
    chartData.forEach(j=>{const k=canonicalCompany(j.company)+"\x00"+norm(j.location);companyRegionCount.set(k,(companyRegionCount.get(k)||0)+1);});
    jobsEl.innerHTML="";
    animNum(document.getElementById("stat-total"),window.AuthGuest?.overview?.total??activeData.length);
    const companies=[...new Set(data.map(j=>canonicalCompany(j.company)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hans-CN"));
    const activeCompanies=new Set(activeData.map(j=>canonicalCompany(j.company)).filter(Boolean));
    animNum(document.getElementById("stat-comp"),window.AuthGuest?.overview?.companies??activeCompanies.size);
    const lastUpd=activeData.reduce((m,j)=>{const t=j.pushTime||j.firstSeen||"";return t>m?t:m;},"");
    const lastUpdDate=new Date(window.AuthGuest?.overview?.updated||lastUpd);
    const lastUpdText=Number.isNaN(lastUpdDate.getTime())?"—":lastUpdDate.toLocaleString("en-GB",{timeZone:"Asia/Singapore",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).replace(", "," ");
    document.getElementById("stat-updated").textContent=lastUpdText;
    companies.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;companyEl.appendChild(o);});
    activeData.forEach(j=>{const region=norm(j.location);if(regionActiveTotals[region]!=null)regionActiveTotals[region]++;});
    const cities=[...new Set(activeData.filter(j=>norm(j.location)==="CN").map(cityOf).filter(Boolean))].sort((a,b)=>{if(a==="N/A")return 1;if(b==="N/A")return -1;return a.localeCompare(b,"zh-Hans-CN");});
    cities.forEach(city=>{const o=document.createElement("option");o.value=city;o.textContent=city;cityEl.appendChild(o);});
    const rc={CN:0,HK:0,SG:0,OTHER:0};chartData.forEach(j=>rc[norm(j.location)]++);
    if(rc.OTHER>0){const o=document.createElement("option");o.value="OTHER";o.textContent="其他地区";cityEl.appendChild(o);}
    const rmax=Math.max(...Object.values(rc),1);
    const distEl=document.getElementById("dist");
    const regionOrder=["CN","HK","SG","OTHER"].filter(k=>rc[k]>0);
    const regionRecords=Object.fromEntries(regionOrder.map(k=>[k,chartData.filter(j=>norm(j.location)===k).map(j=>({j,t:new Date(seenAt(j))})).filter(x=>!isNaN(x.t)).sort((a,b)=>a.t-b.t)]));
    const allTimes=regionOrder.flatMap(k=>regionRecords[k].map(x=>x.t.getTime()));
    const tMin=allTimes.length?Math.min(...allTimes):Date.now(),tMax=allTimes.length?Math.max(...allTimes):tMin,tSpan=Math.max(1,tMax-tMin);
    const TW=520,TH=126,left=48,right=48,top=27,rowGap=27,plotW=TW-left-right,bins=40,cellW=plotW/bins;
    const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const bucketCounts=regionOrder.map(k=>Array.from({length:bins},()=>0));
    regionOrder.forEach((k,ri)=>regionRecords[k].forEach(x=>{const bi=Math.min(bins-1,Math.floor((x.t.getTime()-tMin)/tSpan*bins));bucketCounts[ri][bi]++;}));
    const maxBucket=Math.max(1,...bucketCounts.flat());
    const monthStart=new Date(tMin);monthStart.setHours(0,0,0,0);monthStart.setDate(1);const monthSegments=[];let lastMonthLabelX=-Infinity;for(let d=new Date(monthStart);d.getTime()<tMax;d.setMonth(d.getMonth()+1)){const next=new Date(d);next.setMonth(next.getMonth()+1);const segStart=Math.max(tMin,d.getTime()),segEnd=Math.min(tMax,next.getTime());if(segEnd<=segStart)continue;const x1=left+((segStart-tMin)/tSpan)*plotW,x2=left+((segEnd-tMin)/tSpan)*plotW,label=d.toLocaleDateString('en-US',{month:'short'}).toUpperCase();// Keep every boundary, but render a month label only when its own interval can fit it.
      // The 520-unit SVG shrinks on phones; even a short month name needs a
      // real visual lane or neighboring labels collide.
      const showLabel=((x1+x2)/2-lastMonthLabelX)>=44 && (x1+x2)/2>=left+10 && (x1+x2)/2<=left+plotW-10;
      monthSegments.push('<line class="region-month-boundary" x1="'+x1.toFixed(1)+'" y1="'+(TH-13)+'" x2="'+x1.toFixed(1)+'" y2="'+(TH-7)+'"/>'+(showLabel?'<text class="region-month-label'+(segEnd===tMax?' region-month-current':'')+'" x="'+((x1+x2)/2).toFixed(1)+'" y="'+(TH-5)+'">'+label+'</text>':''));
      if(showLabel)lastMonthLabelX=(x1+x2)/2;}monthSegments.push('<line class="region-month-boundary" x1="'+(left+plotW).toFixed(1)+'" y1="'+(TH-13)+'" x2="'+(left+plotW).toFixed(1)+'" y2="'+(TH-7)+'"/>');const axisTicks=monthSegments.join('');
    const rows=regionOrder.map((k,ri)=>{const y=top+ri*rowGap,pct=chartData.length?Math.round(rc[k]/chartData.length*100):0,rowMax=Math.max(1,...bucketCounts[ri]);const cells=bucketCounts[ri].map((n,i)=>{const x=left+i*cellW,w=cellW,ratio=n/rowMax,level=n===0?0:ratio<=0.12?1:ratio<=0.32?2:ratio<=0.62?3:4,alpha=[0.18,0.38,0.62,0.82,1][level];const from=new Date(tMin+i*tSpan/bins),to=new Date(tMin+(i+1)*tSpan/bins);return '<rect class="region-density density-'+level+' '+k.toLowerCase()+'" x="'+x.toFixed(2)+'" y="'+(y-8)+'" width="'+w.toFixed(2)+'" height="16" rx="0" opacity="'+alpha.toFixed(3)+'"><title>'+escSvg(from.toLocaleDateString('zh-CN'))+'–'+escSvg(to.toLocaleDateString('zh-CN'))+' · '+escSvg(REGIONS[k].label)+' · '+n+' 个职位</title></rect>';}).join('');return '<text class="region-time-name" x="0" y="'+(y+1)+'">'+escSvg(REGIONS[k].label)+'</text><text class="region-time-count" x="'+(TW-1)+'" y="'+(y-3)+'">'+rc[k].toLocaleString()+'</text><text class="region-time-pct" x="'+(TW-1)+'" y="'+(y+8)+'">'+pct+'%</text>'+cells;}).join('');
    distEl.innerHTML='<svg class="region-time-svg" viewBox="0 0 '+TW+' '+TH+'" role="img" aria-label="按首次发现日期统计的三条地区横向时间分布；色带深浅表示时间窗口内职位密度">'+axisTicks+rows+'</svg>';
    const densityWindowDays=Math.max(1,Math.floor((tMax-tMin)/86400000)+1);
    const densityDate=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'});
    const densityStart=densityDate.format(new Date(tMin)).replaceAll('/','.');
    const densityEnd=densityDate.format(new Date(tMax)).replaceAll('/','.').replace(/^\d{4}\./,'');
    const distNote=document.getElementById('distNote');
    if(distNote)distNote.textContent='统计口径为首次抓取日期：'+densityStart+'–'+densityEnd+'（共 '+densityWindowDays+' 天）';
    /* 近 30 日招聘节奏 · 一日一点，折线与日刻度 */
    const RKEYS=["OTHER","SG","HK","CN"];
    const rcounts={};chartData.forEach(j=>{const k=dayKey(seenAt(j));const r=norm(j.location);(rcounts[k]=rcounts[k]||{})[r]=(rcounts[k][r]||0)+1;});
    const today=new Date(),days=[];
    for(let i=29;i>=0;i--){const d=new Date(today);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=keyOf(d),rc=rcounts[key]||{};days.push({date:d,label:d.toLocaleDateString("en-US",{month:"short",day:"numeric"}).toUpperCase(),weekend:d.getDay()===0||d.getDay()===6,rc,total:RKEYS.reduce((s,r)=>s+(rc[r]||0),0)});}
    const smax=Math.max(...days.map(d=>d.total),1),peak=Math.max(...days.map(d=>d.total));
    /* Editorial time-series: keep every daily value without floating labels.
       Trend geometry and the aligned two-row value rail are independent layers. */
    /* Professional clean trend: two meaningful callouts and all data on demand. */
    const SW=520,SH=150,sLeft=26,sRight=19,sTop=18,sBase=112,sPlotW=SW-sLeft-sRight,sPlotH=sBase-sTop;
    const sx=i=>sLeft+(i/(days.length-1))*sPlotW;
    const sy=v=>sBase-(v/smax)*sPlotH;
    const peakIndex=peak>0?days.findIndex(d=>d.total===peak):-1;
    const latestIndex=days.length-1;
    const lowValue=Math.min(...days.map(d=>d.total));
    const lowIndex=days.findIndex(d=>d.total===lowValue);
    const pts=days.map((d,i)=>({x:sx(i),y:sy(d.total),total:d.total}));
    const series=pts.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ');
    const lines=[0,.5,1].map(t=>'<line class="rhythm-grid" x1="'+sLeft+'" y1="'+sy(smax*t).toFixed(2)+'" x2="'+(SW-sRight)+'" y2="'+sy(smax*t).toFixed(2)+'"/>').join('');
    const stems=pts.map((p,i)=>'<line class="rhythm-stick'+(days[i].weekend?' weekend':'')+'" x1="'+p.x.toFixed(2)+'" y1="'+sBase+'" x2="'+p.x.toFixed(2)+'" y2="'+p.y.toFixed(2)+'"/>').join('');
    const nodes=pts.map((p,i)=>{const highlight=i===peakIndex||i===latestIndex;return '<g class="rhythm-point" tabindex="0" role="button" data-day="'+i+'" aria-label="'+days[i].label+': '+p.total+' new postings"><circle class="rhythm-point-hit" cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="8"/><circle class="rhythm-node'+(days[i].weekend?' weekend':'')+(highlight?' focus':'')+'" cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="'+(highlight?3.7:2.35)+'"/><title>'+days[i].label+' · '+p.total+' new postings</title></g>';}).join('');
    const keyLabel=(i,key)=>{const p=pts[i],anchor=i>25?'end':i<4?'start':'middle',dx=anchor==='end'?-4:anchor==='start'?4:0;return '<text class="rhythm-key-label rhythm-key-'+key+'" x="'+(p.x+dx).toFixed(2)+'" y="'+(key==='latest'?Math.min(130,p.y+14):Math.max(11,p.y-12)).toFixed(2)+'" text-anchor="'+anchor+'">'+key.toUpperCase()+' '+p.total+'</text>';};
    // Prioritize high and low; the latest value remains available in its point tooltip.
    // For nearby extrema, move the low callout below its point instead of hiding it.
    const lowLabel=(i)=>{const p=pts[i],anchor=i>25?'end':i<4?'start':'middle',dx=anchor==='end'?-4:anchor==='start'?4:0;return '<text class="rhythm-key-label rhythm-key-low" x="'+(p.x+dx).toFixed(2)+'" y="'+Math.min(130,p.y+14).toFixed(2)+'" text-anchor="'+anchor+'">LOW '+p.total+'</text>';};
    const callouts=(peakIndex>=0?keyLabel(peakIndex,'high'):'')+(lowIndex!==peakIndex?lowLabel(lowIndex):'')+(latestIndex!==peakIndex&&latestIndex!==lowIndex&&Math.abs(latestIndex-peakIndex)>4&&Math.abs(latestIndex-lowIndex)>4?keyLabel(latestIndex,'latest'):'');
    const axis=[0,7,14,21,29].map(i=>'<text class="rhythm-axis-label" x="'+sx(i).toFixed(1)+'" y="144" text-anchor="'+(i===0?'start':i===29?'end':'middle')+'">'+days[i].label+'</text>').join('');
    const sparkEl=document.getElementById("spark");
    sparkEl.innerHTML='<svg class="rhythm-svg" viewBox="0 0 '+SW+' '+SH+'" role="img" aria-label="30-day new postings trend. Point tooltips contain each date and its value."><title>New postings / past 30 days</title>'+lines+stems+'<polyline class="rhythm-line" points="'+series+'"/>'+nodes+callouts+axis+'</svg>';
    requestAnimationFrame(()=>sparkEl.classList.add('is-ready'));
    top50Rows=chartData;
    renderTop50(top50Rows,top50Mode);
    // Let the browser paint the stats and all three charts before the large
    // 8k-card list begins. This removes the perceived chained pause without
    // changing the data, ordering, or filter state.
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    // Yield between small batches so input is processed while older records load.
    const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
    const groups=new Map();
    data.forEach(j=>{const t=placeAt(j);const k=dayKey(t);if(!groups.has(k))groups.set(k,{label:dayLabel(t),items:[]});groups.get(k).items.push(j);});
    const orderedGroups=[...groups.entries()].sort((a,b)=>{if(a[0]==="—")return 1;if(b[0]==="—")return -1;return a[0]<b[0]?1:a[0]>b[0]?-1:0;});
    orderedGroups.forEach(([,g])=>{g.items.sort((x,y)=>{const tx=new Date(placeAt(x)).getTime()||0,ty=new Date(placeAt(y)).getTime()||0;return ty-tx||displayRegionTieBreak(x,y);});});
    const renderGroups=[];
    orderedGroups.forEach(([key,g])=>{for(let i=0;i<g.items.length;i+=120)renderGroups.push([key,{label:g.label,items:g.items.slice(i,i+120),continuation:i>0}]);});
    let roleHistoryIndex=null;
    const roleHistoryGroup=job=>{
      if(document.documentElement.dataset.authState==='guest'||!window.JobRoleHistory||!matchMedia('(min-width:721px)').matches)return null;
      roleHistoryIndex??=JobRoleHistory.build(data,{company:j=>canonicalCompany(j.company),region:j=>norm(j.location),city:cityOf,id:j=>jobId(j.link)});
      return roleHistoryIndex.get(jobId(job.link));
    };
    const roleHistoryUi=window.JobRoleHistory?.bind(jobsEl,{get:id=>roleHistoryIndex?.get(id),id:j=>jobId(j.link),link:safeJobLink,onVisit:id=>{reads.add(id);saveReads();for(const card of jobCards)if(card.dataset.id===id)card.classList.add('read');}});
    function renderJobRow(job,idx,first){
        const r=norm(job.location),lvl=levelOf(job.title),id=jobId(job.link)||(job.title+"|"+job.company),_ad=ageDays(seenAt(job)),expired=job.jobStatus==="expired",expiredText=expired?dayKey(job.expiredAt):"",expiredValidDays=expired?validDays(seenAt(job),job.expiredAt):null,expiredDuration=expiredValidDays==null?"":` valid for ${expiredValidDays} ${expiredValidDays===1?"day":"days"}`,expiredCompanyHtml=expired?'<span class="status-expired status-expired-company" aria-label="关闭日期：'+esc(expiredText)+(expiredDuration?'，'+esc(expiredDuration):'')+'" title="关闭日期：'+esc(expiredText)+(expiredDuration?' · '+esc(expiredDuration):'')+'">'+esc(expiredText)+esc(expiredDuration)+'</span>':'';
        const _coKey=job.company?canonicalCompany(job.company)+"\x00"+r:"";const _coCnt=_coKey?companyRegionCount.get(_coKey)||0:0;const _coHtml=_coCnt>0?'<span class="co-count"><span class="co-separator" aria-hidden="true"></span>'+_coCnt+'</span>':'';
        const delay=first&&!reduce?' style="animation-delay:'+Math.min(idx*.006,.12)+'s"':'';
        const cityFilterValue=r==="OTHER"?"OTHER":cityOf(job),cityLabel=job.city||((job.locationRaw||'').split(',')[0].trim())||'';
        // Some canonical snapshots predate build_frontend_payload.py and omit
        // hasJd while retaining the fetched description fields. Treat either
        // representation as JD-available so the lazy details loader and its
        // expand-only Analytics control remain reachable.
        const hasJd=job.hasJd===true||Boolean(job.descriptionHtml||job.descriptionText);
        return '<article class="job'+(reads.has(id)?' read':'')+(favs.has(id)?' is-favorite':'')+(expired?' expired':'')+'" data-status="'+(expired?'expired':'active')+'" data-region="'+r+'" data-city="'+esc(cityFilterValue)+'" data-comp="'+esc(canonicalCompany(job.company))+'" data-level="'+lvl+'" data-age="'+(_ad==null?'':_ad)+'" data-id="'+esc(id)+'" data-search="'+esc(((job.title||'')+' '+canonicalCompany(job.company)+' '+cityLabel).toLowerCase())+'" data-title="'+esc((job.title||'').toLowerCase())+'"'+delay+'>'+(window.CompanyLogos?window.CompanyLogos.markup(canonicalCompany(job.company),monogram(canonicalCompany(job.company)),first&&idx<12):'<div class="mono">'+esc(monogram(canonicalCompany(job.company)))+'</div>')+'<div class="job-main"><div class="job-heading">'+(expired?'<span class="job-state-closed">关闭</span>':'')+'<a class="job-title" href="'+esc(safeJobLink(job.link))+'" target="_blank" rel="noopener">'+esc(job.title)+'</a></div><div class="job-meta-line">'+(window.JobRoleHistory?JobRoleHistory.button(roleHistoryGroup(job)):'')+'<div class="job-sub'+(job.company?' job-sub-link':'')+'"'+(job.company?' role="button" tabindex="0" title="查看'+esc(job.company)+'的全部职位"':'')+'><span class="company-name">'+esc(canonicalCompany(job.company)||"未知机构")+_coHtml+'</span></div><div class="job-detail-line"><div class="job-jd-row">'+(cityLabel?'<span class="job-city">'+esc(cityLabel)+'</span>':'')+(hasJd?'<details class="job-jd"><summary aria-label="展开职位描述"><span class="job-jd-analytics" role="button" tabindex="0" aria-label="Analytics" hidden>Analytics</span></summary><div class="job-jd-text"></div></details>':'')+'</div><div class="job-right-mobile">'+(_ad!=null?'<span class="age">'+(_ad===0?'今天':_ad<=7?'1周内':_ad<=14?'2周内':_ad<=21?'3周内':'3周+')+'</span>':'')+'<span class="tag">'+r+'</span></div></div><div class="job-meta-end">'+expiredCompanyHtml+'<div class="job-actions" role="group" aria-label="职位操作"><button class="icon-btn star'+(favs.has(id)?' on':'')+'" aria-label="'+(favs.has(id)?'取消收藏':'收藏')+'" aria-pressed="'+favs.has(id)+'" title="'+(favs.has(id)?'取消收藏':'收藏')+'"></button><button class="icon-btn ban" aria-label="屏蔽机构" title="屏蔽该机构"></button></div></div></div></div><div class="job-right"><div class="job-status">'+(_ad!=null?'<span class="age">'+(_ad===0?'今天':_ad<=7?'1周内':_ad<=14?'2周内':_ad<=21?'3周内':'3周+')+'</span>':'')+'<span class="tag">'+r+'</span></div></div></article>';
    }
    if(window.JobListView&&window.JobListQuery){
      const rowDays=new WeakMap();orderedGroups.forEach(([day,group])=>group.items.forEach(job=>rowDays.set(job,{day,label:group.label})));
      const rows=orderedGroups.flatMap(([,group])=>group.items);
      const meta=rows.map(job=>{const region=norm(job.location),title=(job.title||'').toLowerCase(),comp=canonicalCompany(job.company),cityLabel=job.city||((job.locationRaw||'').split(',')[0].trim())||'';return {id:jobId(job.link)||(job.title+'|'+job.company),region,comp,title,displayTitle:job.title||'',search:(title+' '+comp+' '+cityLabel).toLowerCase(),city:region==='OTHER'?'OTHER':cityOf(job),age:ageDays(seenAt(job)),status:job.jobStatus==='expired'?'expired':'active',day:rowDays.get(job).day,label:rowDays.get(job).label,coData:{date:seenAt(job),expiredAt:job.expiredAt,expiredReason:job.expiredReason,status:job.jobStatus==='expired'?'expired':'active',region}};});
      const byId=new Map(meta.map(r=>[r.id,r]));
      const view=new JobListView({host:jobsEl,render:(index,i)=>renderJobRow(rows[index],i,index<120),onMount:()=>{daySections=view.blocks.map(b=>b.el);jobCards=daySections.flatMap(sec=>sec._jobCards);jobCards.forEach(card=>card._coData=byId.get(card.dataset.id)?.coData);roleHistoryUi?.restore();}});
      listRuntime={meta,view,lastKey:null};renderReady=true;delete regionsEl.dataset.pendingRegion;apply();return;
    }
    let first=true,batchJobs=0,batch=document.createDocumentFragment();
    for(const[key,g]of renderGroups){
      if(!first&&batchJobs>=120){jobsEl.appendChild(batch);batch=document.createDocumentFragment();batchJobs=0;await yieldToBrowser();}
      const sec=document.createElement("section");sec.className="day";sec.dataset.dayKey=key;sec.dataset.dayLabel=g.label;sec.dataset.dayContinuation=g.continuation?"1":"0";const rowEstimate=document.body.classList.contains("compact")?50:78;sec.style.containIntrinsicSize="0 "+(44+g.items.length*rowEstimate)+"px";sec._regionCounts={CN:0,HK:0,SG:0,OTHER:0};sec._regionActiveCounts={CN:0,HK:0,SG:0,OTHER:0};sec._activeCount=0;g.items.forEach(j=>{const region=norm(j.location);sec._regionCounts[region]++;if(isActiveJob(j)){sec._regionActiveCounts[region]++;sec._activeCount++;}});daySections.push(sec);
      const head=g.continuation?'':'<div class="day-head"><span class="day-date">'+esc(g.label)+'</span><span class="day-meta tnum" data-role="daycount">'+g.items.filter(isActiveJob).length+' 个有效职位</span>'+'</div>';
      const rows=[];
      g.items.forEach((job,idx)=>rows.push(renderJobRow(job,idx,first)));
      sec.innerHTML=head+rows.join('');
      sec._jobCards=[...sec.querySelectorAll('.job')];
      sec._favoriteCards=new Set(sec._jobCards.filter(card=>favs.has(card.dataset.id)));
      sec._jobCards.forEach((card,i)=>{const job=g.items[i];card._coData={date:seenAt(job),expiredAt:job.expiredAt,expiredReason:job.expiredReason,status:card.dataset.status,region:card.dataset.region};});
      jobCards.push(...sec._jobCards);
      if(first&&window.CompanyLogos)await window.CompanyLogos.prepare(sec);
      batch.appendChild(sec);batchJobs+=g.items.length;first=false;
    }
    if(batchJobs)jobsEl.appendChild(batch);
    renderReady=true;
    delete regionsEl.dataset.pendingRegion;
    apply();
  })
  .catch(()=>{jobsEl.innerHTML="";emptyEl.classList.add("show");emptyEl.querySelector(".big").textContent="职位数据加载失败，请刷新重试";emptyEl.querySelector(".big").nextElementSibling.textContent="网络暂时不可用，或数据加载超时。";});
const activeOnlyEl=document.getElementById("activeOnlyToggle"),activeCountEl=document.getElementById("activeJobCount");
activeOnlyEl.addEventListener("click",()=>{activeOnly=!activeOnly;apply();});
function countLoadedActiveJobs(){
  const q=searchEl.value.trim().toLowerCase(),comp=companyEl.value,ageSel=ageEl.value,kwArr=[...blockedKw];
  let count=0;
  for(const job of loadedJobs){
    if(!isActiveJob(job))continue;
    const company=canonicalCompany(job.company),title=(job.title||'').toLowerCase(),region=norm(job.location);
    const city=region==='OTHER'?'OTHER':cityOf(job),cityLabel=job.city||((job.locationRaw||'').split(',')[0].trim())||'';
    const id=jobId(job.link)||(job.title+'|'+job.company);
    if(!blocked.has(company)&&!kwArr.some(k=>title.includes(k))&&(activeRegion==='all'||region===activeRegion)&&(activeCity==='all'||city===activeCity)&&(comp==='all'||company===comp)&&(!favOnly||favs.has(id))&&(!q||(title+' '+company+' '+cityLabel).toLowerCase().includes(q))&&ageMatch(ageSel,ageDays(seenAt(job))))count++;
  }
  return count;
}
function updateJobCount(count){
  activeCountEl.textContent=window.AuthGuest?.count()??count;
  activeOnlyEl.setAttribute("aria-pressed",String(activeOnly));
  activeOnlyEl.title=activeOnly?"取消仅显示有效职位":"仅显示有效职位";
}
function apply(){
  jobsEl.classList.toggle("fav-only",favOnly);
  if(!renderReady){if(loadedJobs)updateJobCount(countLoadedActiveJobs());return;}
  const q=searchEl.value.trim().toLowerCase(),comp=companyEl.value,ageSel=ageEl.value,kwArr=[...blockedKw];
  companyEl.classList.toggle("on",comp!=="all");ageEl.classList.toggle("on",ageSel!=="all");
  cityEl.classList.toggle("on",activeCity!=="all");
  cityEl.classList.toggle("is-default",cityEl.value==="all");
  compClear.classList.toggle("show",comp!=="all");compClear.parentElement.classList.toggle("filtering",comp!=="all");
  if(typeof listRuntime!=='undefined'&&listRuntime){
    const state={q,company:comp,age:ageSel,region:activeRegion,city:activeCity,favoriteOnly:favOnly,activeOnly,favorites:[...favs],blocked:[...blocked],keywords:kwArr};
    const result=JobListQuery.query(listRuntime.meta,state),key=result.indices.join(',');
    delete jobsEl.dataset.fastRegion;
    if(key!==listRuntime.lastKey){const anchor=listRuntime.view.capture();listRuntime.view.set(result.indices,listRuntime.meta,{anchor});listRuntime.lastKey=key;}
    updateJobCount(result.active);emptyEl.classList.toggle('show',result.indices.length===0);
    if(typeof renderCo==='function')renderCo(comp==='all'?null:comp,result.company.map(i=>listRuntime.meta[i].coData),ageSel);
    document.dispatchEvent(new CustomEvent('jobsfilterchange'));return;
  }
  const canFastFilter=!q&&comp==="all"&&ageSel==="all"&&kwArr.length===0&&blocked.size===0&&!activeOnly&&activeCity==="all"&&(activeRegion==="all"||REGIONS[activeRegion]);
  if(canFastFilter){
    if(!simpleFilterActive){filteredCards.forEach(card=>{card.classList.remove("hidden");card.style.display="";card._filterVisible=true;});filteredCards.clear();}
    simpleFilterActive=true;
    if(activeRegion==="all")delete jobsEl.dataset.fastRegion;else jobsEl.dataset.fastRegion=activeRegion;
    let visible=0,displayed=0;const dayActive=new Map();
    daySections.forEach(sec=>{
      let shown=activeRegion==="all"?sec._jobCards.length:sec._regionCounts[activeRegion];
      let active=activeRegion==="all"?sec._activeCount:sec._regionActiveCounts[activeRegion];
      if(favOnly){shown=0;active=0;sec._favoriteCards.forEach(card=>{if(activeRegion==="all"||card.dataset.region===activeRegion){shown++;if(card.dataset.status!=="expired")active++;}});}
      sec.querySelectorAll('[data-filter-head="true"]').forEach(head=>head.remove());delete sec.dataset.filterHead;sec._filteredShown=shown;sec._filterVisible=shown>0;sec.style.display=shown?"":"none";dayActive.set(sec.dataset.dayKey,(dayActive.get(sec.dataset.dayKey)||0)+active);visible+=active;displayed+=shown;
    });
    const visibleDays=new Set();
    daySections.forEach(sec=>{
      if(sec.style.display==="none"||visibleDays.has(sec.dataset.dayKey))return;
      visibleDays.add(sec.dataset.dayKey);
      const active=dayActive.get(sec.dataset.dayKey)||0;
      if(!sec.querySelector('.day-head')){
        sec.dataset.filterHead="true";
        sec.insertAdjacentHTML('afterbegin','<div class="day-head" data-filter-head="true"><span class="day-date">'+esc(sec.dataset.dayLabel||"—")+'</span><span class="day-meta tnum" data-role="daycount">'+active+' 个有效职位</span></div>');
      }
      const c=sec.querySelector('[data-role="daycount"]');if(c)c.textContent=active+" 个有效职位";
    });
    updateJobCount(visible);
    emptyEl.classList.toggle("show",displayed===0);
    if(typeof renderCo==="function")renderCo(null,[],ageSel);
    document.dispatchEvent(new CustomEvent("jobsfilterchange"));
    return;
  }
  if(simpleFilterActive){delete jobsEl.dataset.fastRegion;simpleFilterActive=false;}
  daySections.forEach(sec=>{sec.querySelectorAll('[data-filter-head="true"]').forEach(head=>head.remove());delete sec.dataset.filterHead;});
  let visible=0,displayed=0;
  const dayTotals=new Map();
  const coRecords=[];
  daySections.forEach(sec=>{
    let shown=0,shownActive=0;
    sec._jobCards.forEach(card=>{
      const age=card.dataset.age===""?null:+card.dataset.age;
      /* base：除“发布时间”之外的全部筛选条件。机构统计包含 base 下的有效与关闭记录，
         因此选中某一时间区间时，分布图仍然完整，不会塌缩为单根柱子。 */
      const base=!blocked.has(card.dataset.comp)&&(kwArr.length===0||!kwArr.some(k=>card.dataset.title.includes(k)))&&(activeRegion==="all"||card.dataset.region===activeRegion)&&(activeCity==="all"||card.dataset.city===activeCity)&&(comp==="all"||card.dataset.comp===comp)&&(!favOnly||favs.has(card.dataset.id))&&(!q||card.dataset.search.includes(q));
      const ok=base&&(!activeOnly||card.dataset.status!=="expired")&&ageMatch(ageSel,age);
      if(base&&comp!=="all")coRecords.push(card._coData);
      if(card._filterVisible!==ok){
        card._filterVisible=ok;
        filteredCards.add(card);
        card.classList.toggle("hidden",!ok);
        card.style.display=ok?"":"none";
      }
      if(ok){shown++;if(card.dataset.status!=="expired")shownActive++;}
    });
    const total=dayTotals.get(sec.dataset.dayKey)||{shown:0,active:0};
    total.shown+=shown;total.active+=shownActive;dayTotals.set(sec.dataset.dayKey,total);
    sec._filteredShown=shown;
    const sectionVisible=shown>0;
    if(sec._filterVisible!==sectionVisible){sec._filterVisible=sectionVisible;sec.style.display=sectionVisible?"":"none";}
    if(sec.style.height!=="auto")sec.style.height="auto";
    if(sec.style.minHeight!=="0px")sec.style.minHeight="0";
    visible+=shownActive;displayed+=shown;
  });
  const visibleDays=new Set();
  daySections.forEach(sec=>{
    const shown=sec.style.display!=="none";
    const key=sec.dataset.dayKey;
    if(!shown||visibleDays.has(key))return;
    visibleDays.add(key);
    const dayTotal=dayTotals.get(key)||{active:0};
    if(!sec.querySelector('.day-head')){
      sec.dataset.filterHead="true";sec.insertAdjacentHTML('afterbegin','<div class="day-head" data-filter-head="true"><span class="day-date">'+esc(sec.dataset.dayLabel||"—")+'</span><span class="day-meta tnum" data-role="daycount">'+dayTotal.active+' 个有效职位</span></div>');
    }
    const c=sec.querySelector('[data-role="daycount"]');if(c)c.textContent=dayTotal.active+" 个有效职位";
  });
  updateJobCount(visible);
  emptyEl.classList.toggle("show",displayed===0);
  if(typeof renderCo==="function")renderCo(comp==="all"?null:comp,coRecords,ageSel);
  document.dispatchEvent(new CustomEvent("jobsfilterchange"));
}
function refreshFavoriteFilterView(){
  // All filter combinations share one state; the simple favorites path uses
  // each section\'s small favorite set instead of visiting every job card.
  apply();
}
document.addEventListener("keydown",e=>{
  const tag=(e.target.tagName||"").toLowerCase();
  if(tag==="input"||tag==="select"||tag==="textarea")return;
  if(e.key==="/"){e.preventDefault();searchEl.focus();}
  else if(e.key.toLowerCase()==="t"){setTheme(document.documentElement.getAttribute("data-theme")==='dark'?'light':'dark');}
});
const totop=document.getElementById("totop");
addEventListener("scroll",()=>{totop.classList.toggle("show",window.scrollY>600);},{passive:true});
// Virtualized list anchor corrections can interrupt smooth scrolling mid-flight.
totop.addEventListener("click",()=>{if(jobsEl._jobView)jobsEl._jobView.jump++;scrollTo({top:0,left:0,behavior:"instant"});});

// A single delegated gesture handler keeps large lists inexpensive.
(() => {
  let gesture=null, suppressUntil=0, swipedCard=null, sheet=null, selected=null, returnFocus=null;
  const mobile=()=>window.matchMedia('(max-width:720px)').matches;
  const refresh=()=>{
    if(!selected||!sheet)return;
    const favorite=favs.has(selected.dataset.id), hidden=blocked.has(selected.dataset.comp);
    sheet.querySelector('[data-action="favorite"]').textContent=favorite?'取消收藏':'收藏';
    sheet.querySelector('[data-action="favorite"]').setAttribute('aria-pressed',String(favorite));
    sheet.querySelector('[data-action="block"]').textContent=hidden?'取消屏蔽机构':'屏蔽机构';
    sheet.querySelector('[data-action="block"]').setAttribute('aria-pressed',String(hidden));
  };
  const open=card=>{
    selected=card;returnFocus=document.activeElement;
    if(!sheet){
      sheet=document.createElement('dialog');sheet.className='job-action-sheet';
      sheet.setAttribute('aria-labelledby','job-action-heading');
      sheet.innerHTML='<div class="job-sheet-handle" aria-hidden="true"></div><header><div><h2 id="job-action-heading"></h2><p class="job-sheet-company"></p></div><button type="button" class="job-sheet-close" aria-label="关闭">×</button></header><div class="job-sheet-options"><button type="button" data-action="favorite"></button><button type="button" data-action="block"></button></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener('click',event=>{
        if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)sheet.close();return;}
        if(event.target.closest('.job-sheet-close')){sheet.close();return;}
        const action=event.target.closest('[data-action]');if(!action||!selected)return;
        selected.querySelector(action.dataset.action==='favorite'?'.star':'.ban')?.click();refresh();
      });
      sheet.addEventListener('close',()=>{if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});selected=null;});
    }
    sheet.querySelector('h2').textContent=card.querySelector('.job-title')?.textContent||'职位操作';
    sheet.querySelector('.job-sheet-company').textContent=card.dataset.comp||'';
    refresh();if(!sheet.open)sheet.showModal();
  };
  const resetSwipe=start=>{
    if(!start)return;
    if(start.frame)cancelAnimationFrame(start.frame);
    start.card.classList.remove('is-swiping');
    if(start.amount>0){
      start.card.classList.add('swipe-return');
      start.card.style.setProperty('--job-swipe-size','0px');
      const token=start.card._swipeResetToken=(start.card._swipeResetToken||0)+1;
      window.setTimeout(()=>{if(start.card._swipeResetToken!==token)return;start.card.classList.remove('swipe-return');start.card.style.removeProperty('--job-swipe-size');},220);
    }else {
      start.card.style.removeProperty('--job-swipe-size');
    }
  };
  jobsEl.addEventListener('pointerdown',event=>{
    resetSwipe(gesture);gesture=null;
    if(!mobile()||event.pointerType==='mouse'||!event.isPrimary||event.target.closest('details,button,input,textarea,select,[contenteditable]'))return;
    const card=event.target.closest('.job');if(!card)return;
    card._swipeResetToken=(card._swipeResetToken||0)+1;
    card.classList.remove('swipe-return');
    gesture={card,id:event.pointerId,x:event.clientX,y:event.clientY,time:event.timeStamp,frame:0,amount:0};
  },{passive:true});
  jobsEl.addEventListener('pointermove',event=>{
    const start=gesture;if(!start||start.id!==event.pointerId)return;
    const dx=start.x-event.clientX,dy=Math.abs(start.y-event.clientY);
    if(dy>12&&dy>Math.abs(dx)){resetSwipe(start);gesture=null;return;}
    if(!start.amount&&(dx<12||dx<dy*1.5))return;
    start.amount=Math.max(0,Math.min(96,dx));start.card.classList.add('is-swiping');
    if(!start.frame)start.frame=requestAnimationFrame(()=>{start.frame=0;start.card.style.setProperty('--job-swipe-size',start.amount+'px');});
  },{passive:true});
  jobsEl.addEventListener('pointerup',event=>{
    const start=gesture;gesture=null;if(!start||start.id!==event.pointerId)return;
    const dx=start.x-event.clientX,dy=Math.abs(start.y-event.clientY);
    resetSwipe(start);
    if(dx<56||dx<dy*1.8||event.timeStamp-start.time>1000||window.getSelection()?.toString())return;
    swipedCard=start.card;suppressUntil=performance.now()+500;open(start.card);
  },{passive:true});
  jobsEl.addEventListener('pointercancel',()=>{resetSwipe(gesture);gesture=null;},{passive:true});
  jobsEl.addEventListener('click',event=>{
    if(performance.now()<suppressUntil&&event.target.closest('.job')===swipedCard&&event.isTrusted){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  // Keyboard access on compact layouts without permanently visible controls.
  jobsEl.addEventListener('keydown',event=>{if(mobile()&&event.shiftKey&&event.key==='F10'){const card=event.target.closest('.job');if(card){event.preventDefault();open(card);}}});
  window.addEventListener('resize',()=>{if(!mobile()&&sheet?.open)sheet.close();},{passive:true});
})();

