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
const keyOf=d=>window.JobDates.key(d);
const dayKey=iso=>window.JobDates.key(iso)||"—";
const dayLabel=iso=>window.JobDates.fullDay(iso,{weekday:true});
const isActiveJob=job=>job?.jobStatus!=="expired";
// A listing's age and lifetime start on its immutable first record, never on a repost.
const seenAt=j=>j.firstSeen;
// Posting/reposting event charts have a separate, deliberate source-date clock.
const postingAt=j=>j.postingLastDate||j.firstSeen||j.pushTime;
const validDays=(start,end)=>{const cal=window.JobDates;const a=cal.dayStart(cal.key(start)),b=cal.dayStart(cal.key(end));if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;return Math.round((b-a)/864e5);};
// List placement follows the recorded push/repost date; ages stay on firstSeen.
const placeAt=j=>j.pushTime||j.firstSeen;
// Within a posted calendar day, retain captured update order and region ties.
const displayRegionRank={CN:0,HK:1,SG:2,OTHER:3};
const displayRegionOf=j=>norm(j?.location);
const displayRegionTieBreak=(a,b)=>(displayRegionRank[displayRegionOf(a)]??9)-(displayRegionRank[displayRegionOf(b)]??9);
const ageDays=iso=>window.JobDates.calendarAge(iso);
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
favEl.addEventListener("click",()=>{favOnly=!favOnly;if(favOnly)ageEl.value="all";favEl.classList.toggle("active",favOnly);refreshFavoriteFilterView();});
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
// Top 30 drawing lives in top30-layout.js, which replaces this binding once
// loaded. Until then this placeholder intentionally renders nothing.
function renderTop50(rows,mode="all"){window.Top30Layout?.render(rows,mode);}
/* One shared chart tooltip for every homepage figure. It is a single fixed
   element (never inside an SVG), so it cannot be clipped by a chart frame and
   never changes chart layout. Content is built from numbers and fixed labels. */
window.VizTip=(()=>{
  let tip=null;
  const ensure=()=>{
    if(tip)return tip;
    tip=document.createElement('div');tip.className='viz-tip';tip.setAttribute('aria-hidden','true');tip.hidden=true;
    document.body.append(tip);return tip;
  };
  const row=(label,value,region)=>'<span class="viz-tip-row"'+(region?' data-region="'+region+'"':'')+'><span class="viz-tip-key">'+(region?'<i aria-hidden="true"></i>':'')+label+'</span><b>'+value+'</b></span>';
  // Keyboard readings pass their focused element as an anchor: on scroll the
  // tooltip follows it instead of vanishing. Pointer readings hide on scroll.
  let anchor=null;
  const place=(x,y)=>{
    const t=tip,r=t.getBoundingClientRect(),margin=10;
    const maxLeft=Math.max(margin,innerWidth-r.width-margin);
    const maxTop=Math.max(margin,innerHeight-r.height-margin);
    let left=x+16,top=y-r.height-14;
    if(left+r.width>innerWidth-margin)left=x-r.width-16;
    if(top<margin)top=y+18;
    left=Math.min(maxLeft,Math.max(margin,left));
    top=Math.min(maxTop,Math.max(margin,top));
    t.style.transform='translate('+Math.round(left)+'px,'+Math.round(top)+'px)';
  };
  function show(html,x,y,target=null){
    const t=ensure();t.innerHTML=html;t.hidden=false;anchor=target;
    if(anchor){const a=anchor.getBoundingClientRect();place(a.right,a.top);}else place(x,y);
  }
  function hide(){anchor=null;if(tip)tip.hidden=true;}
  addEventListener('scroll',()=>{
    if(!tip||tip.hidden)return;
    if(anchor?.isConnected){const a=anchor.getBoundingClientRect();place(a.right,a.top);}else hide();
  },{passive:true});
  // Touch readings stay up after the finger lifts; a tap elsewhere dismisses.
  document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('#dist,#spark,#top50'))hide();},true);
  return {show,hide,row};
})();
const meanOf=values=>{const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((sum,age)=>sum+age,0)/valid.length:null;};
// Mirrors weeklyFlow() in scripts/guest_preview.mjs; keep the two identical.
function weeklyFlow(jobs){
  const week=7*864e5,regions=["CN","HK","SG"],seen=new Set(),date=v=>{const t=window.JobDates.timestamp(v);return Number.isFinite(t)?t:0;};
  const day=v=>window.JobDates.dayStart(window.JobDates.key(v));
  let end=0,current=0,prior=0;
  for(const j of jobs)if(j&&regions.includes(j.location))end=Math.max(end,date(j.pushTime||j.firstSeen),date(j.expiredAt));
  if(!end)return null;
  const endDay=day(end);
  for(const j of jobs){
    if(!j||!regions.includes(j.location))continue;
    const key=j.link||JSON.stringify([j.company,j.title,j.firstSeen]);if(seen.has(key))continue;seen.add(key);
    const t=day(j.postingLastDate||j.firstSeen||j.pushTime);if(!Number.isFinite(t)||t>endDay)continue;
    const age=endDay-t;if(age<week)current++;else if(age<2*week)prior++;
  }
  return {current,prior,end:new Date(end).toISOString()};
}
/* Masthead and metric band: every figure is derived from the same
   deduplicated rows as the charts below; nothing here is a static claim. */
function renderHeadline(allRows,chartRows){
  const overview=window.AuthGuest?.overview,now=Date.now();
  const ages=[];
  for(const job of chartRows){const age=window.JobDates.calendarAge(seenAt(job),now);if(age!=null)ages.push(age);}
  // One definition in both modes (see weeklyFlow in scripts/guest_preview.mjs):
  // CN/HK/SG roles posted in the 7 Beijing calendar days ending at the latest data update,
  // including roles that have since closed. Guests receive the counts from the
  // server because their preview payload carries open roles only.
  const flow=overview?overview.weekly:weeklyFlow(allRows);
  const weekEl=document.getElementById("stat-week"),weekNote=document.getElementById("stat-week-note");
  if(weekEl){
    if(flow)animNum(weekEl,flow.current);else weekEl.textContent='—';
    const end=flow?.end?new Date(flow.end):null;
    if(end&&!Number.isNaN(end.getTime()))weekEl.closest('.stat').title='Roles in Mainland China, Hong Kong and Singapore posted in the 7 calendar days to '+
      end.toLocaleString('en-GB',{timeZone:'Asia/Singapore',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' SGT, including roles that have since closed';
  }
  if(weekNote&&flow&&flow.prior>0){
    const change=(flow.current-flow.prior)/flow.prior*100,flat=Math.abs(change)<0.5;
    weekNote.textContent=flat?'level with the prior 7 days':(change>0?'▲ ':'▼ ')+Math.abs(change).toFixed(0)+'% vs the prior 7 days';
    weekNote.dataset.trend=flat?'flat':change>0?'up':'down';
  }
  const age=meanOf(ages),ageEl=document.getElementById("stat-age");
  if(ageEl)ageEl.textContent=age==null?'—':String(Math.round(age*10)/10);
}
// The coverage rows double as shortcuts into the filtered list.
document.querySelectorAll('.nj-market-row[data-region]').forEach(row=>row.addEventListener('click',()=>{
  setRegion(row.dataset.region);
  const toolbar=document.querySelector('.toolbar');
  requestAnimationFrame(()=>toolbar?.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'}));
}));
const jdPlainText=html=>String(html||"").replace(/<br\s*\/?>/gi," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
jobsEl.innerHTML=Array.from({length:6}).map(()=>'<div class="sk"><div class="sk-box sk-mono"></div><div><div class="sk-box sk-l1"></div><div class="sk-box sk-l2"></div></div></div>').join("");
// Keep immutable publication-event totals separate from mutable job records.
let postingHistoryDaily=null;
// Keep conditional cache validation so repeat visits can reuse the browser's copy.
const jobsDataPromise=(window.__jobsIndexDocument||window.JobIndexStore.load())
  .then(data=>{postingHistoryDaily=data?.postingHistoryDaily||data?.previewOverview?.postingHistoryDaily||null;window.AuthGuest?.setOverview(data);window.CompanyLogos?.setManifest(data?.companyLogos,data?.companyLogoFallback);const rows=Array.isArray(data)?data:(Array.isArray(data?.jobs)?data.jobs:[]);rows.forEach(job=>{const company=canonicalCompany(job.company);if(company!==job.company)job.company=company;});return rows;});
window.__jobsDataPromise=jobsDataPromise;
let jobsDataReceived=false,jobsCoreReady=false;
jobsDataPromise
  .then(async data=>{
    jobsDataReceived=true;
    // Wait only for row/chart enhancements, not optional modules such as the
    // guestbook, avoiding a second chart layout or missing initial row actions.
    await window.__appCoreReady;
    jobsCoreReady=true;
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
    const lastUpdText=window.JobDates.formatStamp(window.AuthGuest?.overview?.updated||lastUpd,{compact:true});
    document.getElementById("stat-updated").textContent=lastUpdText;
    renderHeadline(data,chartData);
    companies.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;companyEl.appendChild(o);});
    activeData.forEach(j=>{const region=norm(j.location);if(regionActiveTotals[region]!=null)regionActiveTotals[region]++;});
    const cities=[...new Set(activeData.filter(j=>norm(j.location)==="CN").map(cityOf).filter(Boolean))].sort((a,b)=>{if(a==="N/A")return 1;if(b==="N/A")return -1;return a.localeCompare(b,"zh-Hans-CN");});
    cities.forEach(city=>{const o=document.createElement("option");o.value=city;o.textContent=city;cityEl.appendChild(o);});
    const rc={CN:0,HK:0,SG:0,OTHER:0};chartData.forEach(j=>rc[norm(j.location)]++);
    if(rc.OTHER>0){const o=document.createElement("option");o.value="OTHER";o.textContent="其他地区";cityEl.appendChild(o);}
    const rmax=Math.max(...Object.values(rc),1);
    const distEl=document.getElementById("dist");
    // One true cumulative regional stack: active roles by the same posting-day cohort as the list.
    // The daily 30-day chart below retains the separate daily-new metric.
    const regionOrder=["HK","SG","CN"];
    const regionRecords=Object.fromEntries(regionOrder.map(k=>[k,chartData.filter(j=>norm(j.location)===k)
      .map(j=>({j,t:window.JobDates.dayStart(window.JobDates.key(seenAt(j)))})).filter(x=>Number.isFinite(x.t))]));
    const allTimes=regionOrder.flatMap(k=>regionRecords[k].map(x=>x.t));
    const dayMs=86400000;
    const observedTimes=allTimes.filter(t=>t>=window.JobDates.dayStart('2026-01-01'));
    const timelineTimes=observedTimes.length?observedTimes:allTimes;
    const latestStamp=timelineTimes.length?Math.max(...timelineTimes):Date.now();
    const earliestStamp=timelineTimes.length?Math.min(...timelineTimes):latestStamp;
    const utcDay=stamp=>window.JobDates.dayStart(window.JobDates.key(stamp));
    const tMin=utcDay(earliestStamp),tMax=utcDay(latestStamp)+dayMs;
    const bins=Math.max(1,Math.round((tMax-tMin)/dayMs));
    // Both analytics plots reach the same right margin (17/520). Keep the
    // cumulative plot wide; annotations stay in the unused early-year area.
    const TW=520,TH=360,left=43,right=17,top=18,base=326,plotW=TW-left-right;
    const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    // Exact UTC daily observations. No rolling windows and no weekly buckets.
    const bucketCounts=regionOrder.map(()=>Array.from({length:bins},()=>0));
    regionOrder.forEach((k,ri)=>regionRecords[k].forEach(x=>{
      const timestamp=x.t;
      if(timestamp<tMin||timestamp>=tMax)return;
      bucketCounts[ri][Math.floor((timestamp-tMin)/dayMs)]++;
    }));
    const cumulativeSeries=bucketCounts.map(daily=>{
      let running=0;
      return [0,...daily.map(n=>(running+=n))];
    });
    const endTotal=cumulativeSeries.reduce((n,values)=>n+values[bins],0);
    // Region plot gets a close-fitting, conventional 1/2/5 scale while
    // preserving the zero origin and all cumulative totals.
    // A quiet 1/2/5 axis with roughly four intervals rather than seven
    // competing gridlines. The true zero and final summed count remain exact.
    const regionMagnitude=10**Math.floor(Math.log10(Math.max(1,endTotal)/4));
    const regionStep=Math.max(1,Math.round(
      [1,2,5,10].find(n=>n*regionMagnitude>=Math.max(1,endTotal)/4)*regionMagnitude));
    // Keep a modest ~5% headroom instead of 20-25% unused upper space.
    // Retain a linear zero-origin scale and conventional 1/2/5 tick steps.
    const topIncrement=Math.max(.25,regionStep/4);
    const regionMax=Math.max(regionStep,Math.ceil(endTotal*1.05/topIncrement)*topIncrement);
    const regionTicks=Array.from({length:Math.floor(regionMax/regionStep)+1},
      (_,i)=>i*regionStep);
    // Keep the existing independent daily-new axis unchanged.
    const niceCountAxis=maxValue=>{
      const observed=Math.max(1,Math.ceil(Number(maxValue)||0));
      const rough=observed/4;
      const magnitude=10**Math.floor(Math.log10(rough));
      const selected=[1,2,5,10].find(v=>v*magnitude>=rough)*magnitude;
      const step=Math.max(1,Math.round(selected));
      const upper=Math.ceil(observed/step)*step;
      return {max:upper,step,ticks:Array.from({length:Math.round(upper/step)+1},(_,i)=>i*step)};
    };
    // First posting day sits exactly at the left edge, final day at the
    // right edge. Do not reserve an empty full-day margin before the data.
    const trendX=i=>left+(bins===1?0:Math.max(0,i-1)/(bins-1))*plotW;
    const trendY=value=>base-value/regionMax*(base-top);
    // Preserve an absolute-value y scale but remove the redundant long
    // horizontal gridlines. Only local dashed cumulative-height references
    // below explain the three final regional intervals.
    const gridTicks=regionTicks.map(v=>
      '<text class="region-spark-value" x="'+(left-9)+'" y="'+(trendY(v)+3).toFixed(2)+
      '" text-anchor="end">'+v+'</text>'
    ).join('');
    const regionTickFormat=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'Asia/Singapore'});
    // This Date-only chart helper must NEVER shadow the ISO-safe list dayLabel.
    const regionAxisDayLabel=(date)=>regionTickFormat.format(date);
    const axisCssWidth=distEl.getBoundingClientRect().width||TW;
    // Calendar ticks describe a REGULAR cadence, not the two arbitrary data
    // endpoints. Keep the calendar axis free of supplementary range captions.
    const calendarCandidates=[];
    const calendarMode=bins>180?'quarter':bins>56?'month':bins>7?'week':'day';
    const calendarStep=calendarMode==='quarter'?(bins>730?12:bins>365?6:3):calendarMode==='week'
      ?(7/(bins-1)*plotW*axisCssWidth/TW>=43?7:14)
      :calendarMode==='day'?Math.max(1,Math.ceil(bins/5),Math.ceil(40*Math.max(1,bins-1)/(plotW*axisCssWidth/TW))):1;
    const monthFormat=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'});
    for(let day=0;day<bins;day++){
      const dateKey=window.JobDates.key(tMin+day*dayMs),date=new Date(dateKey+'T00:00:00Z'),serial=Math.floor(date.getTime()/dayMs);
      const month=date.getUTCMonth();
      const include=calendarMode==='quarter'||calendarMode==='month'
        ?date.getUTCDate()===1&&month%calendarStep===0
        :calendarMode==='week'?(serial-4)%calendarStep===0
        :day%calendarStep===0;
      if(!include)continue;
      calendarCandidates.push({day,date:date.toISOString().slice(0,10),label:
        calendarMode==='quarter'||calendarMode==='month'?monthFormat.format(date):regionAxisDayLabel(date)});
    }
    const dateTicks=calendarCandidates.map(item=>{
      const x=trendX(item.day+1),anchor=x-left<24?'start':TW-right-x<24?'end':'middle';
      return '<line class="region-date-tick" x1="'+x.toFixed(2)+'" x2="'+x.toFixed(2)+'" y1="333" y2="337"/>'+
        '<text class="region-spark-date" x="'+x.toFixed(2)+
        '" y="351" data-day="'+item.day+'" data-date="'+item.date+'" text-anchor="'+anchor+'">'+
        escSvg(item.label)+'</text>';
    }).join('');
    // Snapshot counts and share labels are generated from precisely the same
    // 2026 cumulative series and denominator as the stacked y-axis. Never
    // reuse the all-time count or display a static percentage.
    const snapshotCounts=cumulativeSeries.map(values=>values[bins]);
    const countFormat=new Intl.NumberFormat('en-US');
    // Largest-remainder allocation keeps the three displayed shares at
    // exactly 100.0%, even for uneven counts after tenths-place rounding.
    const rawShareTenths=snapshotCounts.map(n=>endTotal?n*1000/endTotal:0);
    const shareTenths=rawShareTenths.map(n=>Math.floor(n));
    const leftover=endTotal?1000-shareTenths.reduce((a,n)=>a+n,0):0;
    const shareRank=rawShareTenths.map((n,i)=>({i,fraction:n-Math.floor(n)}))
      .sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
    for(let i=0;i<leftover;i++)shareTenths[shareRank[i].i]++;
    // Exact final stacked levels: zero, HK, HK+SG, HK+SG+CN. Four SHORT
    // dashed references are confined to the open early-year zone, never
    // drawn through the area. Three staggered, detached double-end measures
    // indicate the true vertical distance of each regional interval; they
    // are not a second continuous value axis.
    const endBoundaries=regionOrder.map((_,i)=>
      snapshotCounts.slice(0,i+1).reduce((n,v)=>n+v,0));
    const cumulativeLevels=[0,...endBoundaries];
    const bandMiddleY=regionOrder.map((_,i)=>
      trendY((cumulativeLevels[i]+cumulativeLevels[i+1])/2));
    const shortHistory=bins<100;
    // Uneven editorial spacing follows the ascending curves: a measured
    // 65-unit step, then a more open 79-unit step. Keep every vertical
    // dimension attached to the true cumulative boundaries.
    const measureX={HK:78,SG:143,CN:222};
    const referenceLines=[...new Set(cumulativeLevels)].map(level=>{
      const adjacent=regionOrder.filter((k,i)=>snapshotCounts[i]>0&&
        (cumulativeLevels[i]===level||cumulativeLevels[i+1]===level)).map(k=>measureX[k]);
      if(!adjacent.length)return '';
      return '<line class="region-measure-reference" data-level="'+level+
        '" x1="'+(Math.min(...adjacent)-10)+'" x2="'+(Math.max(...adjacent)+14)+
        '" y1="'+trendY(level).toFixed(2)+'" y2="'+trendY(level).toFixed(2)+'"/>';
    }).join('');
    const verticalMeasures=regionOrder.map((k,i)=>{
      const count=snapshotCounts[i];
      if(!count)return '';
      const x=measureX[k];
      const low=trendY(cumulativeLevels[i]),high=trendY(cumulativeLevels[i+1]);
      // Editorial interval mark, not a directional arrow: two short terminal
      // rules touch the REAL cumulative boundaries. Their final CSS-pixel
      // width and paired visibility are resolved after SVG layout, and
      // recomputed on resize to avoid stale pre-render width measurements.
      const capHalf=4.2*TW/axisCssWidth;
      const capLines=[["upper",high],["lower",low]].map(([edge,y])=>
        '<line class="region-measure-cap" data-region="'+k+
        '" data-edge="'+edge+'" x1="'+(x-capHalf).toFixed(2)+
        '" x2="'+(x+capHalf).toFixed(2)+'" y1="'+y.toFixed(2)+
        '" y2="'+y.toFixed(2)+'"/>').join('');
      return '<g class="region-series '+k.toLowerCase()+' region-measure-group">'+
        '<line class="region-measure-height" data-region="'+k+
        '" data-count="'+count+'" data-lower="'+cumulativeLevels[i]+
        '" data-upper="'+cumulativeLevels[i+1]+'" x1="'+x+'" x2="'+x+
        '" y1="'+low.toFixed(2)+'" y2="'+high.toFixed(2)+'"/>'+
        capLines+'</g>';
    }).join('');
    const localMeasurements='<g class="region-measurements" aria-hidden="true">'+
      referenceLines+verticalMeasures+'</g>';
    // Two-line regional readings use genuine CSS pixels on mobile. They
    // sit between dashed levels, where the early-year chart is still empty.
    // The labels may shift to avoid collisions, but the dimension strokes
    // never move away from their actual cumulative y coordinates.
    // Nudge text optically by only a few real CSS pixels. Bound each nudge
    // to 15% of its own band height, including narrow/uneven data histories.
    const labelBiasPx={HK:-4,SG:3,CN:-3};
    const visibleRows=regionOrder.map((k,i)=>{
      const bandHeight=Math.abs(trendY(cumulativeLevels[i])-trendY(cumulativeLevels[i+1]));
      const requested=labelBiasPx[k]*TW/axisCssWidth;
      const opticalBias=Math.sign(requested)*Math.min(Math.abs(requested),bandHeight*.15);
      return {k,i,target:bandMiddleY[i]+opticalBias};
    })
      .filter(row=>snapshotCounts[row.i]>0).sort((a,b)=>a.target-b.target);
    const labelMargin=Math.max(22,22*TW/axisCssWidth);
    const minLabelY=top+labelMargin,maxLabelY=base-labelMargin;
    const minGap=Math.max(40,40*TW/axisCssWidth);
    let previous=minLabelY-minGap;
    visibleRows.forEach(row=>{
      row.y=Math.max(minLabelY,row.target,previous+minGap);
      previous=row.y;
    });
    const overflow=visibleRows.length?Math.max(0,visibleRows.at(-1).y-maxLabelY):0;
    visibleRows.forEach(row=>row.y-=overflow);
    const labelY=Object.fromEntries(visibleRows.map(row=>[row.k,row.y]));
    // As the accumulated bands rise towards the right, the inset editorial
    // readings advance gently rightward too, rather than forming a rigid column.
    // Keep every value inside the existing left whitespace, never in a side panel.
    const labelX=Object.fromEntries(regionOrder.map(k=>[k,measureX[k]+16*TW/axisCssWidth]));
    const directLabels='<div class="region-end-labels" aria-hidden="true">'+
      regionOrder.map((k,i)=>{
        const count=snapshotCounts[i];
        if(!count)return '';
        const share=(shareTenths[i]/10).toFixed(1)+'%';
        return '<div class="region-series '+k.toLowerCase()+
          ' region-end-label" data-region="'+k+'" data-count="'+count+
          '" data-share="'+share+'" data-band-center="'+bandMiddleY[i].toFixed(2)+
          '" style="top:'+(labelY[k]/TH*100).toFixed(4)+
          '%;left:'+(labelX[k]/TW*100).toFixed(4)+'%">'+
          '<span class="region-end-name">'+k+'</span>'+
          '<strong class="region-end-count">'+countFormat.format(count)+'</strong>'+
          '<span class="region-end-share">'+share+'</span></div>';
      }).join('')+'</div>';
    // Retain ALL daily counts and every exact date. Only the painted
    // contours use shared adaptive knots: each cumulative boundary deviates
    // by at most 0.58 SVG pixels from its real daily height.
    // Monotone cubic slopes preserve the original vertical stack and cannot
    // introduce an artificial dip in a cumulative series.
    const sumBoundary=(layers,arrays)=>Array.from({length:bins+1},(_,i)=>
      arrays.slice(0,layers).reduce((sum,values)=>sum+values[i],0));
    const upperBoundaries=regionOrder.map((_,i)=>sumBoundary(i+1,cumulativeSeries));
    const knotDays=bins===1?[1]:[1,bins];
    const slopeAtKnots=(values,knots)=>{
      const result=Array.from({length:bins+1},()=>0);
      if(knots.length===1)return result;
      const rates=knots.slice(1).map((day,j)=>
        (values[day]-values[knots[j]])/(day-knots[j]));
      result[knots[0]]=rates[0];
      result[knots.at(-1)]=rates.at(-1);
      for(let j=1;j<knots.length-1;j++){
        const before=rates[j-1],after=rates[j];
        result[knots[j]]=before<=0||after<=0?0:2*before*after/(before+after);
      }
      return result;
    };
    const cubicAt=(values,slopes,a,b,day)=>{
      const t=(day-a)/(b-a),t2=t*t,t3=t2*t,span=b-a;
      return (2*t3-3*t2+1)*values[a]+(t3-2*t2+t)*span*slopes[a]+
        (-2*t3+3*t2)*values[b]+(t3-t2)*span*slopes[b];
    };
    let regionSlopes=[],curveErrorPx=0;
    for(;;){
      regionSlopes=cumulativeSeries.map(values=>slopeAtKnots(values,knotDays));
      let worstDay=-1,worstError=0;
      for(let seg=0;seg<knotDays.length-1;seg++){
        const a=knotDays[seg],b=knotDays[seg+1];
        for(let day=a+1;day<b;day++){
          let interpolated=0;
          for(let ri=0;ri<regionOrder.length;ri++){
            interpolated+=cubicAt(cumulativeSeries[ri],regionSlopes[ri],a,b,day);
            const error=Math.abs(interpolated-upperBoundaries[ri][day])*
              (base-top)/regionMax;
            if(error>worstError){worstError=error;worstDay=day;}
          }
        }
      }
      curveErrorPx=worstError;
      if(worstDay<0||worstError<=.58||knotDays.length>=bins)break;
      knotDays.push(worstDay);
      knotDays.sort((x,y)=>x-y);
    }
    const fmtPoint=(x,y)=>x.toFixed(2)+','+y.toFixed(2);
    const contourPath=(values,slopes,reverse=false)=>{
      if(bins===1){
        const y=trendY(values[1]);
        return reverse
          ?'M'+fmtPoint(TW-right,y)+' L'+fmtPoint(left,y)
          :'M'+fmtPoint(left,y)+' L'+fmtPoint(TW-right,y);
      }
      const indices=reverse?[...knotDays].reverse():knotDays;
      let d='M'+fmtPoint(trendX(indices[0]),trendY(values[indices[0]]));
      for(let j=1;j<indices.length;j++){
        const a=indices[j-1],b=indices[j],dx=trendX(b)-trendX(a),days=b-a;
        d+=' C'+fmtPoint(trendX(a)+dx/3,
          trendY(values[a]+slopes[a]*days/3))+
          ' '+fmtPoint(trendX(b)-dx/3,
          trendY(values[b]-slopes[b]*days/3))+
          ' '+fmtPoint(trendX(b),trendY(values[b]));
      }
      return d;
    };
    const series=regionOrder.map((k,ri)=>{
      const daily=bucketCounts[ri],regional=cumulativeSeries[ri];
      const lower=sumBoundary(ri,cumulativeSeries);
      const upper=sumBoundary(ri+1,cumulativeSeries);
      const lowerSlope=sumBoundary(ri,regionSlopes);
      const upperSlope=sumBoundary(ri+1,regionSlopes);
      const className='region-series '+k.toLowerCase();
      const active=regional[bins]>0;
      // Each band covers the entire timeline; zero daily additions do NOT
      // interrupt the region's already cumulative area.
      const contour=active?contourPath(upper,upperSlope):'';
      const area=active?'<path class="region-stack-band" d="'+contour+
        ' '+contourPath(lower,lowerSlope,true).replace(/^M/,'L')+' Z"/>':'';
      const hits=daily.map((n,i)=>{
        if(!n)return '';
        const current=new Date(tMin+i*dayMs);
        const label=REGIONS[k].label+' · '+regional[i+1]+' currently active roles posted by '+
          regionTickFormat.format(current)+' · +'+n+' posted that day';
        return '<circle class="region-spark-hit" cx="'+trendX(i+1).toFixed(2)+
          '" cy="'+trendY((lower[i+1]+upper[i+1])/2).toFixed(2)+
          '" r="5" data-bin="'+i+'" data-count="'+n+
          '" data-cumulative="'+regional[i+1]+'" data-lower="'+lower[i+1]+
          '" data-upper="'+upper[i+1]+'" data-stacked="'+
          cumulativeSeries.reduce((sum,region)=>sum+region[i+1],0)+
          '" role="img" aria-label="'+escSvg(label)+
          '"><title>'+escSvg(label)+'</title></circle>';
      }).join('');
      return {
        area:'<g class="'+className+' region-fill">'+area+'</g>',
        outline:'<g class="'+className+' region-boundary">'+
          (contour?'<path class="region-spark-line" clip-path="url(#dist-region-contour-edge)" d="'+contour+'"/>':'')+hits+'</g>'
      };
    });
    distEl.innerHTML='<div class="region-plot-stage'+(shortHistory?' is-short-history':'')+
      '" data-visible-total="'+endTotal+'">'+
      '<svg class="region-time-svg" data-chart-kind="cumulative-stack"'+
      ' data-day-bins="'+bins+'" data-final-total="'+endTotal+
      '" data-plot-right="'+(TW-right)+'" data-calendar-mode="'+calendarMode+'" data-calendar-step="'+calendarStep+
      '" data-axis-max="'+regionMax+
      '" data-curve-knots="'+knotDays.length+'" data-curve-error="'+curveErrorPx.toFixed(3)+
      '" data-region-hk="'+cumulativeSeries[0][bins]+
      '" data-region-sg="'+cumulativeSeries[1][bins]+
      '" data-region-cn="'+cumulativeSeries[2][bins]+'" viewBox="0 0 '+TW+' '+TH+
      '" role="img" aria-label="Cumulative stack of currently active roles by first recorded date: HK, then SG, then CN. '+countFormat.format(endTotal)+
      ' active roles in this chart: '+regionOrder.map((k,i)=>k+' '+countFormat.format(snapshotCounts[i])+' ('+(shareTenths[i]/10).toFixed(1)+'%)').join(', ')+
      '. The y-axis is the sum of these three regions, not historical active inventory">'+
      // The filled band and its contour end at the exact same x. A painted
      // stroke otherwise extends beyond its own path endpoint (especially
      // when round line caps are enabled and SVG overflow is visible).
      // Clip ONLY contour paint at the shared right boundary, retaining
      // interaction targets and all fill geometry.
      '<defs><clipPath id="dist-region-contour-edge" clipPathUnits="userSpaceOnUse">'+
      '<rect x="0" y="0" width="'+(TW-right)+'" height="'+TH+'"/></clipPath></defs>'+
      gridTicks+series.map(layer=>layer.area).join('')+localMeasurements+
      '<g class="region-projections" aria-hidden="true" pointer-events="none"></g>'+
      series.map(layer=>layer.outline).join('')+dateTicks+'</svg>'+
      directLabels+'</div>';
    // Each regional boundary now has ONE uninterrupted, subordinate guide to
    // its real plotted endpoint. The former bounding-box cutouts removed broad
    // spans of the line when a nearby two-line label merely touched its padding.
    // Align text in the open space between its actual rows instead; never carve
    // a hole in a guide and never draw a guide through visible letterforms.
    distEl._regionProjectionCleanup?.();
    const projectionSvg=distEl.querySelector('.region-time-svg');
    const projectionLayer=projectionSvg.querySelector('.region-projections');
    let projectionFrame=0,projectionDisposed=false,projectionMarkup='';
    const updateRegionProjections=()=>{
      projectionFrame=0;
      if(projectionDisposed||!projectionSvg.isConnected)return;
      const box=projectionSvg.getBoundingClientRect();
      if(!box.width||!box.height)return;
      // Size end caps using the ACTUAL post-layout SVG pixel width, not
      // the pre-render host width (which can change in flex/grid layouts).
      // ResizeObserver maintains the 8.4px optical standard after rotation.
      const finalHalf=4.2*TW/box.width;
      for(const group of projectionSvg.querySelectorAll('.region-measure-group')){
        const stem=group.querySelector('.region-measure-height');
        const x=Number(stem.getAttribute('x1'));
        const heightPx=Math.abs(Number(stem.getAttribute('y1'))-
          Number(stem.getAttribute('y2')))*box.height/TH;
        for(const cap of group.querySelectorAll('.region-measure-cap')){
          cap.setAttribute('x1',(x-finalHalf).toFixed(3));
          cap.setAttribute('x2',(x+finalHalf).toFixed(3));
          cap.style.display=heightPx>=10?'':'none';
        }
      }
      const references=[...projectionSvg.querySelectorAll('.region-measure-reference')]
        .filter(node=>Number(node.dataset.level)>0).map(node=>({
          level:Number(node.dataset.level),y:Number(node.getAttribute('y1')),
          start:Number(node.getAttribute('x2')),end:TW-right
        }));
      const labels=[...distEl.querySelectorAll('.region-end-label')];
      // Reset optical offsets before measuring after viewport/font changes.
      labels.forEach(node=>{node.style.transform='translateY(-50%)';});
      const cssY=y=>box.top+y*box.height/TH;
      const cssX=x=>box.left+x*box.width/TW;
      for(const label of labels){
        const frame=label.getBoundingClientRect();
        const textRows=[...label.querySelectorAll(
          '.region-end-name,.region-end-count,.region-end-share'
        )].map(node=>node.getBoundingClientRect());
        const relevant=references.filter(ref=>textRows.some(rect=>
          rect.right>cssX(ref.start)&&rect.left<cssX(ref.end)));
        // Half-pixel search (max 24 CSS px) preserves the existing staircase
        // while letting a dash pass through the 3px row gap on narrow phones.
        const fits=delta=>{
          if(frame.top+delta<box.top+5||frame.bottom+delta>box.bottom-5)return false;
          for(const ref of relevant)for(const rect of textRows){
            const y=cssY(ref.y);
            if(y>=rect.top+delta-.9&&y<=rect.bottom+delta+.9)return false;
          }
          for(const other of labels){
            if(other===label)continue;
            const rect=other.getBoundingClientRect();
            if(frame.left<rect.right+2&&frame.right>rect.left-2&&
               frame.top+delta<rect.bottom+2&&frame.bottom+delta>rect.top-2)return false;
          }
          return true;
        };
        let shift=null;
        for(let step=0;step<=48;step++){
          const candidates=step===0?[0]:[-step*.5,step*.5];
          const selected=candidates.find(fits);
          if(selected!==undefined){shift=selected;break;}
        }
        // In an exceptionally crowded/zero-height band, prefer an intact,
        // low-opacity guide behind foreground text to a conspicuous hole.
        if(shift!==null&&shift!==0)
          label.style.transform='translateY(calc(-50% + '+shift.toFixed(1)+'px))';
      }
      const markup=references.map(ref=>
        '<g class="region-projection" data-level="'+ref.level+
        '" data-start="'+ref.start+'" data-end="'+ref.end+'" data-y="'+ref.y+'">'+
        '<line class="region-projection-line" x1="'+ref.start+'" x2="'+ref.end+
        '" y1="'+ref.y+'" y2="'+ref.y+'"/></g>'
      ).join('');
      if(markup!==projectionMarkup){projectionLayer.innerHTML=markup;projectionMarkup=markup;}
      projectionLayer.dataset.ready='true';
    };
    const scheduleRegionProjections=()=>{
      if(!projectionDisposed&&!projectionFrame)projectionFrame=requestAnimationFrame(updateRegionProjections);
    };
    // Relayout is deterministic on rotation, responsive resize and font load.
    const projectionObserver=typeof ResizeObserver==='function'
      ?new ResizeObserver(scheduleRegionProjections):null;
    projectionObserver?.observe(projectionSvg);
    distEl.querySelectorAll('.region-end-label').forEach(node=>projectionObserver?.observe(node));
    if(!projectionObserver)window.addEventListener('resize',scheduleRegionProjections);
    document.fonts?.ready.then(scheduleRegionProjections);
    distEl._regionProjectionCleanup=()=>{
      projectionDisposed=true;cancelAnimationFrame(projectionFrame);
      projectionObserver?.disconnect();
      window.removeEventListener('resize',scheduleRegionProjections);
    };
    updateRegionProjections();
    // Figure 01 headline and inspection: both read the same cumulative series
    // as the painted bands, so the tooltip can never disagree with the chart.
    // Shared labels for both figure tooltips, independent of editorial copy.
    const regionName={HK:'Hong Kong',SG:'Singapore',CN:'Mainland China',OTHER:'Other'};
    if(window.VizTip&&bins>1){
      const ns='http://www.w3.org/2000/svg';
      const guide=document.createElementNS(ns,'line');
      guide.setAttribute('class','region-crosshair');guide.setAttribute('y1',String(top));guide.setAttribute('y2',String(base));
      guide.style.display='none';
      const capture=document.createElementNS(ns,'rect');
      capture.setAttribute('class','region-hover-capture');
      // Every day owns an equal slot centred on its x, so the first and last
      // days (including the final total) are as easy to reach as any other.
      const slot=plotW/(bins-1);
      capture.setAttribute('x',(left-slot/2).toFixed(2));capture.setAttribute('y',String(top));
      capture.setAttribute('width',(plotW+slot).toFixed(2));capture.setAttribute('height',String(base-top));
      projectionSvg.append(guide,capture);
      const tipDate={format:date=>window.JobDates.fullDay(date)};
      const inspect=e=>{
        const box=projectionSvg.getBoundingClientRect();if(!box.width)return;
        const vx=(e.clientX-box.left)/box.width*TW;
        const i=Math.max(1,Math.min(bins,Math.round((vx-left)/plotW*(bins-1))+1));
        const x=trendX(i).toFixed(2);guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.style.display='';
        const values=regionOrder.map((_,ri)=>cumulativeSeries[ri][i]);
        const sum=values.reduce((a,b)=>a+b,0);
        const lines=regionOrder.map((k,ri)=>({k,ri})).reverse()
          .map(({k,ri})=>window.VizTip.row(regionName[k],countFormat.format(values[ri]),k)).join('');
        window.VizTip.show('<span class="viz-tip-title">Open roles posted by '+tipDate.format(new Date(tMin+(i-1)*dayMs))+'</span>'+
          lines+window.VizTip.row('Total',countFormat.format(sum)),e.clientX,e.clientY);
      };
      capture.addEventListener('pointermove',inspect);
      capture.addEventListener('pointerleave',e=>{if(e.pointerType==='touch')return;guide.style.display='none';window.VizTip.hide();});
    }
    /* 近 30 日招聘节奏 · 一日一点，折线与日刻度 */
    const RKEYS=["OTHER","SG","HK","CN"];
    const rcounts={};
    if(typeof postingHistoryDaily!=="undefined"&&postingHistoryDaily){
      for(const [date,values] of Object.entries(postingHistoryDaily)){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!values||typeof values!=="object")continue;
        rcounts[date]=Object.fromEntries(RKEYS.map(region=>[region,Math.max(0,Number(values[region])||0)]));
      }
    }else{
      // One-time compatibility while the ledger is first published. This
      // snapshot fallback is not a complete immutable publishing history.
      chartData.forEach(j=>{const k=dayKey(postingAt(j));const r=norm(j.location);(rcounts[k]=rcounts[k]||{})[r]=(rcounts[k][r]||0)+1;});
    }
    const today=window.JobDates.key(Date.now()),days=[];
    for(let i=29;i>=0;i--){const key=window.JobDates.addDays(today,-i),d=new Date(key+"T00:00:00Z"),rc=rcounts[key]||{};days.push({key,date:d,label:window.JobDates.shortDay(key).toUpperCase(),weekend:[0,6].includes(window.JobDates.weekday(key)),rc,total:RKEYS.reduce((s,r)=>s+(rc[r]||0),0)});}
    const smax=Math.max(...days.map(d=>d.total),1),peak=Math.max(...days.map(d=>d.total));
    /* Daily flow. Every column is the exact posting-day count for one local
       calendar day, stacked by market in the same order and pigments as
       Figure 01 (HK at the base, then SG, then CN; OTHER on top, neutral).
       Daily inspection retains exact date, count and a trailing 7-day
       average in tooltips; no average line is drawn over the columns. */
    const SW=520,SH=158,sLeft=33,sRight=17,sTop=24,sBase=130,sPlotW=SW-sLeft-sRight,sPlotH=sBase-sTop;
    const sx=i=>sLeft+(i/(days.length-1))*sPlotW;
    const rhythmAxis=niceCountAxis(smax);
    const sy=v=>sBase-(v/rhythmAxis.max)*sPlotH;
    const barWidth=Math.min(11.3,sPlotW/days.length*.72);
    const scaleValues=rhythmAxis.ticks;
    const STACK=["HK","SG","CN","OTHER"];
    const dayTotal=date=>{const rc=rcounts[keyOf(date)]||{};return RKEYS.reduce((sum,r)=>sum+(rc[r]||0),0);};
    const trailing=days.map(d=>{
      let sum=0;
      for(let back=0;back<7;back++){sum+=dayTotal(window.JobDates.addDays(d.key,-back));}
      return sum/7;
    });
    const lastIndex=days.length-1;
    const guides=scaleValues.map(v=>
      '<line class="rhythm-grid" x1="'+sLeft+'" y1="'+sy(v).toFixed(2)+
      '" x2="'+(SW-sRight)+'" y2="'+sy(v).toFixed(2)+'"/>'+
      '<text class="rhythm-scale-label" x="'+(sLeft-10)+'" y="'+(sy(v)+3).toFixed(2)+
      '" text-anchor="end">'+v+'</text>'
    ).join('');
    const step=sPlotW/(days.length-1);
    const weekendBands=days.map((d,i)=>d.weekend?'<rect class="rhythm-weekend" x="'+(sx(i)-step/2).toFixed(2)+
      '" y="'+sTop+'" width="'+step.toFixed(2)+'" height="'+sPlotH+'"/>':'').join('');
    const peakIndex=peak>0?days.findIndex(d=>d.total===peak):-1;
    const bars=days.map((d,i)=>{
      const x=sx(i)-barWidth/2,y=sy(d.total),h=Math.max(0,sBase-y);
      const isPeak=i===peakIndex,partial=i===lastIndex;
      let running=0;
      const segments=STACK.map(r=>{
        const n=d.rc[r]||0;if(!n)return '';
        const y1=sy(running+n),y0=sy(running);running+=n;
        return '<rect class="rhythm-seg '+r.toLowerCase()+'" data-region="'+r+'" data-count="'+n+
          '" x="'+x.toFixed(2)+'" y="'+y1.toFixed(2)+'" width="'+barWidth.toFixed(2)+
          '" height="'+Math.max(0,y0-y1).toFixed(2)+'"/>';
      }).join('');
      const label=d.label+': '+d.total+' new postings'+(partial?' so far':'')+
        STACK.filter(r=>d.rc[r]).map(r=>', '+r+' '+d.rc[r]).join('');
      return '<g class="rhythm-point'+(partial?' is-partial':'')+'" tabindex="'+(i===lastIndex?'0':'-1')+'" role="img" data-day="'+i+
        '" data-total="'+d.total+'" aria-label="'+label+'">'+segments+
        '<rect class="rhythm-bar'+(d.weekend?' weekend':'')+(isPeak?' peak':'')+
        '" x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+barWidth.toFixed(2)+
        '" height="'+h.toFixed(2)+'" rx="0.8"/>'+
        '<rect class="rhythm-bar-hit" x="'+(sx(i)-step/2).toFixed(2)+'" y="'+sTop+
        '" width="'+step.toFixed(2)+'" height="'+(sBase-sTop)+'"/></g>';
    }).join('');
    const peakLabel=peakIndex>=0?'<text class="rhythm-peak-label" x="'+sx(peakIndex).toFixed(2)+'" y="'+(sy(peak)-5).toFixed(2)+
      '" text-anchor="middle">'+peak+'</text>':'';
    // A 30-day window always uses real Mondays, seven days apart. Do not
    // inject arbitrary endpoints or silently drop weeks to fit endpoint text.
    const rhythmTickFormat={format:d=>window.JobDates.shortDay(d)};
    const rhythmMarks=days.map((d,i)=>window.JobDates.weekday(d.key)===1?i:-1).filter(i=>i>=0);
    const dateLabels=rhythmMarks.map(i=>{
      const x=sx(i),anchor=x-sLeft<24?'start':SW-sRight-x<24?'end':'middle';
      return '<line class="rhythm-date-tick" x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="136" y2="140"/>'+
        '<text class="rhythm-axis-label" x="'+x.toFixed(1)+
        '" y="153" data-day="'+i+'" data-date="'+keyOf(days[i].date)+'" text-anchor="'+anchor+'">'+
        rhythmTickFormat.format(days[i].date)+'</text>';
    }).join('');
    const sparkEl=document.getElementById("spark");
    sparkEl.innerHTML='<svg class="rhythm-svg" data-chart-kind="stacked-daily" viewBox="0 0 '+SW+' '+SH+
      '" role="img" aria-label="30-day new postings, one column per day stacked by market. Each column provides the exact date and count.">'+
      weekendBands+guides+bars+peakLabel+dateLabels+'</svg>';
    if(window.VizTip){
      const tipFormat={format:d=>window.JobDates.fullDay(d,{weekday:true})};
      const inspectDay=(node,x,y,target=null)=>{
        const i=Number(node.dataset.day),d=days[i];if(!d)return;
        sparkEl.querySelectorAll('.rhythm-point.is-hover').forEach(n=>n.classList.remove('is-hover'));
        node.classList.add('is-hover');
        const lines=[...STACK].reverse().filter(r=>d.rc[r]).map(r=>window.VizTip.row(regionName[r],d.rc[r],r)).join('');
        window.VizTip.show('<span class="viz-tip-title">'+tipFormat.format(d.date)+(i===lastIndex?' · so far':'')+'</span>'+lines+
          window.VizTip.row('Total',d.total)+(i<lastIndex?window.VizTip.row('7-day average',Math.round(trailing[i])):''),x,y,target);
      };
      const clear=()=>{sparkEl.querySelectorAll('.rhythm-point.is-hover').forEach(n=>n.classList.remove('is-hover'));window.VizTip.hide();};
      // Keyboard inspection owns the tooltip until focus genuinely leaves the
      // figure. Pointerleave or empty-plot moves must not erase that reading.
      const keyboardInspecting=()=>sparkEl.contains(document.activeElement);
      sparkEl.addEventListener('pointermove',e=>{
        const node=e.target.closest('.rhythm-point');
        if(node&&!keyboardInspecting())inspectDay(node,e.clientX,e.clientY);
        else if(!node&&!keyboardInspecting())clear();
      });
      sparkEl.addEventListener('pointerleave',e=>{
        if(e.pointerType!=='touch'&&!keyboardInspecting())clear();
      });
      sparkEl.addEventListener('focusin',e=>{
        const node=e.target.closest('.rhythm-point');if(!node)return;
        inspectDay(node,0,0,node.querySelector('.rhythm-bar-hit')||node);
      });
      sparkEl.addEventListener('focusout',e=>{
        if(!sparkEl.contains(e.relatedTarget))clear();
      });
    }
    // One tab stop for all thirty columns; arrow keys, Home and End move by day.
    sparkEl.addEventListener('keydown',e=>{
      const node=e.target.closest?.('.rhythm-point');if(!node)return;
      const points=[...sparkEl.querySelectorAll('.rhythm-point')],at=points.indexOf(node);
      const to=e.key==='ArrowLeft'?at-1:e.key==='ArrowRight'?at+1:e.key==='Home'?0:e.key==='End'?points.length-1:null;
      if(to===null||to<0||to>=points.length)return;
      e.preventDefault();node.tabIndex=-1;points[to].tabIndex=0;points[to].focus();
    });
    requestAnimationFrame(()=>sparkEl.classList.add('is-ready'));
    // Market Breadth uses first-recorded cohorts, unlike New Postings' latest
    // publishing-event cohorts. Reposts cannot reset original listing dates.
    window.MarketWidth?.render(window.AuthGuest?.marketBreadthRows||data,days);
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
    orderedGroups.forEach(([,g])=>{g.items.sort((x,y)=>{const tx=Date.parse(x.pushTime||x.firstSeen||"")||0,ty=Date.parse(y.pushTime||y.firstSeen||"")||0;return ty-tx||displayRegionTieBreak(x,y);});});
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
        const r=norm(job.location),lvl=levelOf(job.title),id=jobId(job.link)||(job.title+"|"+job.company),_ad=ageDays(seenAt(job)),expired=job.jobStatus==="expired",expiredText=expired?window.JobDates.shortDay(job.expiredAt):"",expiredValidDays=expired?validDays(job.firstSeen,job.expiredAt):null,expiredDuration=expiredValidDays==null?"":` valid for ${expiredValidDays} ${expiredValidDays===1?"day":"days"}`,expiredCompanyHtml=expired?'<span class="status-expired status-expired-company" aria-label="关闭日期：'+esc(expiredText)+(expiredDuration?'，'+esc(expiredDuration):'')+'" title="关闭日期：'+esc(expiredText)+(expiredDuration?' · '+esc(expiredDuration):'')+'">'+esc(expiredText)+esc(expiredDuration)+'</span>':'';
        const _coKey=job.company?canonicalCompany(job.company)+"\x00"+r:"";const _coCnt=_coKey?companyRegionCount.get(_coKey)||0:0;const _coHtml=_coCnt>0?'<span class="co-count"><span class="co-separator" aria-hidden="true"></span>'+_coCnt+'</span>':'';
        const delay=first&&!reduce?' style="animation-delay:'+Math.min(idx*.006,.12)+'s"':'';
        const cityFilterValue=r==="OTHER"?"OTHER":cityOf(job),cityLabel=job.city||((job.locationRaw||'').split(',')[0].trim())||'';
        // Some canonical snapshots predate build_frontend_payload.py and omit
        // hasJd while retaining the fetched description fields. Treat either
        // representation as JD-available so the lazy details loader and its
        // expand-only Analytics control remain reachable.
        const hasJd=job.hasJd===true||Boolean(job.descriptionHtml||job.descriptionText);
        return '<article class="job'+(reads.has(id)?' read':'')+(favs.has(id)?' is-favorite':'')+(expired?' expired':'')+'" data-status="'+(expired?'expired':'active')+'" data-region="'+r+'" data-city="'+esc(cityFilterValue)+'" data-comp="'+esc(canonicalCompany(job.company))+'" data-level="'+lvl+'" data-age="'+(_ad==null?'':_ad)+'" data-id="'+esc(id)+'" data-search="'+esc(((job.title||'')+' '+canonicalCompany(job.company)+' '+cityLabel).toLowerCase())+'" data-title="'+esc((job.title||'').toLowerCase())+'"'+delay+'>'+(window.CompanyLogos?window.CompanyLogos.markup(canonicalCompany(job.company),monogram(canonicalCompany(job.company)),first&&idx<12):'<div class="mono">'+esc(monogram(canonicalCompany(job.company)))+'</div>')+'<div class="job-main"><div class="job-heading">'+(expired?'<span class="job-state-closed">关闭</span>':'')+'<a class="job-title" href="'+esc(safeJobLink(job.link))+'" target="_blank" rel="noopener">'+esc(job.title)+'</a></div><div class="job-meta-line">'+(window.JobRoleHistory?JobRoleHistory.button(roleHistoryGroup(job)):'')+'<div class="job-sub'+(job.company?' job-sub-link':'')+'"'+(job.company?' role="button" tabindex="0" title="查看'+esc(job.company)+'的全部职位"':'')+'><span class="company-name">'+esc(canonicalCompany(job.company)||"未知机构")+_coHtml+'</span></div><div class="job-detail-line"><div class="job-jd-row">'+(cityLabel?'<span class="job-city">'+esc(cityLabel)+'</span>':'')+(hasJd?'<details class="job-jd"><summary aria-label="展开职位描述"><span class="job-jd-analytics" role="button" tabindex="0" aria-label="Analytics" hidden>Analytics</span></summary><div class="job-jd-text"></div></details>':'')+'</div><div class="job-right-mobile">'+(_ad!=null?'<span class="age">'+(_ad===0?'今天':_ad<=7?'1周内':_ad<=14?'2周内':_ad<=21?'3周内':'3周+')+'</span>':'')+'<span class="tag">'+r+'</span></div></div><div class="job-meta-end">'+expiredCompanyHtml+'<div class="job-actions" role="group" aria-label="职位操作">'+(window.JobApplications?JobApplications.button(id,favs.has(id)):'')+'<button class="icon-btn star'+(favs.has(id)?' on':'')+'" aria-label="'+(favs.has(id)?'取消收藏':'收藏')+'" aria-pressed="'+favs.has(id)+'" title="'+(favs.has(id)?'取消收藏':'收藏')+'"></button><button class="icon-btn ban" aria-label="屏蔽机构" title="屏蔽该机构"></button></div></div></div></div><div class="job-right"><div class="job-status">'+(_ad!=null?'<span class="age">'+(_ad===0?'今天':_ad<=7?'1周内':_ad<=14?'2周内':_ad<=21?'3周内':'3周+')+'</span>':'')+'<span class="tag">'+r+'</span></div></div></article>';
    }
    if(window.JobListView&&window.JobListQuery){
      const rowDays=new WeakMap();orderedGroups.forEach(([day,group])=>group.items.forEach(job=>rowDays.set(job,{day,label:group.label})));
      const rows=orderedGroups.flatMap(([,group])=>group.items);
      const meta=rows.map(job=>{const region=norm(job.location),title=(job.title||'').toLowerCase(),comp=canonicalCompany(job.company),cityLabel=job.city||((job.locationRaw||'').split(',')[0].trim())||'';return {id:jobId(job.link)||(job.title+'|'+job.company),region,comp,title,displayTitle:job.title||'',search:(title+' '+comp+' '+cityLabel).toLowerCase(),city:region==='OTHER'?'OTHER':cityOf(job),age:ageDays(seenAt(job)),status:job.jobStatus==='expired'?'expired':'active',day:rowDays.get(job).day,label:rowDays.get(job).label,coData:{date:job.firstSeen,postingDate:postingAt(job),expiredAt:job.expiredAt,expiredReason:job.expiredReason,status:job.jobStatus==='expired'?'expired':'active',region}};});
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
      sec._jobCards.forEach((card,i)=>{const job=g.items[i];card._coData={date:job.firstSeen,postingDate:postingAt(job),expiredAt:job.expiredAt,expiredReason:job.expiredReason,status:card.dataset.status,region:card.dataset.region};});
      jobCards.push(...sec._jobCards);
      if(first&&window.CompanyLogos)await window.CompanyLogos.prepare(sec);
      batch.appendChild(sec);batchJobs+=g.items.length;first=false;
    }
    if(batchJobs)jobsEl.appendChild(batch);
    renderReady=true;
    delete regionsEl.dataset.pendingRegion;
    apply();
    if(window.JobIndexStore?.cacheState==='stale'){
      const notice=document.createElement('div');
      notice.className='jobs-data-notice';
      notice.setAttribute('role','status');
      const label=document.createElement('span');
      label.textContent='当前使用上次保存的职位数据，最新同步暂不可用。';
      const refresh=document.createElement('button');
      refresh.type='button';refresh.textContent='重新获取';refresh.onclick=()=>location.reload();
      notice.append(label,refresh);jobsEl.prepend(notice);
    }
  })
  .catch(error=>{
    // A chart/runtime exception is not a network timeout. Retain the actual
    // failure in the console and give users a specific, actionable state.
    const status=Number(error?.status||0);
    const stage=!jobsDataReceived?'index':!jobsCoreReady?'scripts':'render';
    console.error('[jobs] '+stage+' failed',error);
    jobsEl.replaceChildren();
    const title=emptyEl.querySelector('.big');
    const detail=title?.nextElementSibling;
    if(stage==='render'){
      title.textContent='页面数据处理失败';
      detail.textContent='职位数据已获取，但页面渲染发生错误。请重新加载。';
    }else if(stage==='scripts'){
      title.textContent='页面资源加载失败';
      detail.textContent='必要的页面脚本未完整加载，请刷新重试。';
    }else if(status===401||status===403){
      title.textContent='职位数据访问受限';
      detail.textContent='请求被拒绝（HTTP '+status+'）。请检查登录状态或网络安全限制后重试。';
    }else if(status===404){
      title.textContent='职位数据文件暂不可用';
      detail.textContent='服务器未找到本次数据文件（HTTP 404），请稍后再试。';
    }else{
      title.textContent='职位数据加载失败';
      detail.textContent=/timeout|abort/i.test(String(error?.message||error?.name||''))
        ?'数据下载超时，请检查网络连接后重试。'
        :'数据请求或解析失败，请检查网络后重试。';
    }
    emptyEl.classList.add('show');
    let retry=emptyEl.querySelector('.jobs-load-retry');
    if(!retry){retry=document.createElement('button');retry.className='jobs-load-retry';
      retry.type='button';retry.textContent='重新加载';retry.onclick=()=>location.reload();emptyEl.appendChild(retry);}
  });
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
    window.JobApplications?.sheet(sheet,selected,favorite);
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
        if(action.dataset.action==='application'){window.JobApplications?.open(selected,action,true);return;}
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



