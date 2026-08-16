/*
 * LinkedIn 金融职位精选 · 页面逻辑
 * 依赖：jobs.json
 */
const IC={
  star:'<svg class="star-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.6 15.09 8.86 22 9.87 17 14.74 18.18 21.62 12 18.37 5.82 21.62 7 14.74 2 9.87 8.91 8.86 12 2.6"/></svg>',
  ban:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  rows:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
};
const SUN='<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" stroke="none"/><g fill="none"><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></g></svg>';
const MOON='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const tbtn=document.getElementById('themeToggle');
tbtn.innerHTML='<span class="tt-ic tt-sun">'+SUN+'</span><span class="tt-track"><span class="tt-thumb"></span></span><span class="tt-ic tt-moon">'+MOON+'</span>';
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  tbtn.setAttribute('data-mode',t);
  tbtn.setAttribute('aria-checked',t==='dark'?'true':'false');
  localStorage.setItem('theme',t);
}
setTheme(localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
tbtn.addEventListener('click',()=>setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
(function(){
  const stack=document.getElementById('mastStack');
  if(!stack)return;
  const front=document.getElementById('mastAvatar');
  if(front){front.addEventListener('load',()=>stack.classList.add('show'));front.addEventListener('error',()=>{stack.style.display='none';});}
  stack.querySelectorAll('.mast-avatar').forEach(im=>{im.src='avatars/1.jpg';});
})();
(function(){
  const bg=document.getElementById('mastBg');
  if(!bg)return;
  const pic='avatars/'+(Math.random()<0.5?'2':'3')+'.jpeg';
  const im=new Image();
  im.onload=()=>{bg.style.backgroundImage='url('+pic+')';bg.classList.add('show');};
  im.onerror=()=>{bg.style.display='none';};
  im.src=pic;
})();
document.getElementById('totop').innerHTML=IC.up;
document.getElementById('favToggle').innerHTML=IC.star+'<span>收藏</span>';
const dbtn=document.getElementById('densityToggle');
dbtn.innerHTML=IC.rows+'<span>紧凑</span>';
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduce)document.body.classList.add('anim');
const REGIONS={CN:{label:"中国大陆"},HK:{label:"香港"},SG:{label:"新加坡"},OTHER:{label:"其他"}};
const norm=loc=>{const u=(loc||"OTHER").toUpperCase();return REGIONS[u]?u:"OTHER";};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const monogram=n=>{const t=(n||"?").trim();return t?t[0].toUpperCase():"?";};
const jobId=link=>{if(!link)return"";const path=String(link).split(/[?#]/)[0];const m=path.match(/(\d{5,})\/?$/)||String(link).match(/[?&]currentJobId=(\d+)/);return m?("ln:"+m[1]):path.replace(/\/+$/,"");};
const keyOf=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dayKey=iso=>{const d=new Date(iso);return isNaN(d)?"—":keyOf(d);};
const dayLabel=iso=>{const d=new Date(iso);return isNaN(d)?"未知日期":d.toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"});};
const seenAt=j=>j.firstSeen||j.pushTime;
const placeAt=j=>j.pushTime||j.firstSeen;
const ageDays=iso=>{const d=new Date(iso);if(isNaN(d))return null;return Math.max(0,Math.floor((Date.now()-d)/864e5));};
const ageMatch=(sel,d)=>{if(sel==="all")return true;if(d==null)return false;if(sel==="22+")return d>=22;const p=sel.split("-").map(Number);return p[1]==null?d===p[0]:(d>=p[0]&&d<=p[1]);};
function levelOf(t){t=(t||"").toLowerCase();if(/\bintern(s|ship)?\b/.test(t)||/实习/.test(t))return"Intern";if(/\b(md|managing director|director|head of)\b/.test(t)||/总监|主管/.test(t))return"Director+";if(/\b(vp|svp|evp|vice president)\b/.test(t)||/副总裁/.test(t))return"VP";if(/associate/.test(t)||/经理/.test(t))return"Associate";if(/analyst/.test(t)||/分析师|专员/.test(t))return"Analyst";return"Other";}
function animNum(el,target,suffix){suffix=suffix||"";if(reduce){el.innerHTML=target.toLocaleString()+suffix;return;}const dur=900,start=performance.now();const step=now=>{const p=Math.min((now-start)/dur,1),e=1-Math.pow(1-p,3);el.innerHTML=Math.round(target*e).toLocaleString()+suffix;if(p<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
const favs=new Set(JSON.parse(localStorage.getItem("favs")||"[]"));
const reads=new Set(JSON.parse(localStorage.getItem("reads")||"[]"));
const blocked=new Set(JSON.parse(localStorage.getItem("blocked")||"[]"));
const blockedKw=new Set(JSON.parse(localStorage.getItem("blockedKw")||"[]"));
const saveFavs=()=>localStorage.setItem("favs",JSON.stringify([...favs]));
const saveReads=()=>localStorage.setItem("reads",JSON.stringify([...reads]));
const saveBlocked=()=>localStorage.setItem("blocked",JSON.stringify([...blocked]));
const saveBlockedKw=()=>localStorage.setItem("blockedKw",JSON.stringify([...blockedKw]));
(function(){if(localStorage.getItem("favKeyV")==="2")return;[favs,reads].forEach(set=>{const arr=[...set];set.clear();arr.forEach(k=>set.add(jobId(k)));});saveFavs();saveReads();localStorage.setItem("favKeyV","2");})();
const jobsEl=document.getElementById("jobs"),emptyEl=document.getElementById("empty"),searchEl=document.getElementById("search"),companyEl=document.getElementById("company"),ageEl=document.getElementById("age"),regionsEl=document.getElementById("regions"),favEl=document.getElementById("favToggle"),countEl=document.getElementById("count"),blockedBar=document.getElementById("blockedBar"),compClear=document.getElementById("compClear");
compClear.addEventListener("click",()=>{companyEl.value="all";apply();});
jobsEl.addEventListener("click",e=>{
  const card=e.target.closest(".job");if(!card||!jobsEl.contains(card))return;
  const id=card.dataset.id;
  if(e.target.closest(".job-title")){reads.add(id);saveReads();card.classList.add("read");return;}
  const star=e.target.closest(".star");
  if(star){e.preventDefault();if(favs.has(id)){favs.delete(id);star.classList.remove("on");}else{favs.add(id);star.classList.add("on");}star.title=favs.has(id)?"取消收藏":"收藏";saveFavs();if(favOnly)apply();return;}
  const ban=e.target.closest(".ban");
  if(ban){e.preventDefault();const c=card.dataset.comp;if(c){blocked.add(c);saveBlocked();renderBlocked();apply();}return;}
  const sub=e.target.closest(".job-sub-link");
  if(sub){e.preventDefault();e.stopPropagation();const c=card.dataset.comp;if(c){companyEl.value=c;apply();const tb=document.querySelector(".toolbar");if(tb)tb.scrollIntoView({behavior:"smooth",block:"start"});}}
});
jobsEl.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const sub=e.target.closest(".job-sub-link");if(!sub)return;e.preventDefault();const card=sub.closest(".job"),c=card?.dataset.comp;if(c){companyEl.value=c;apply();const tb=document.querySelector(".toolbar");if(tb)tb.scrollIntoView({behavior:"smooth",block:"start"});}});
const kwToggle=document.getElementById("kwToggle"),kwPanel=document.getElementById("kwPanel"),kwForm=document.getElementById("kwForm"),kwInput=document.getElementById("kwInput"),kwList=document.getElementById("kwList");
let activeRegion="all",favOnly=false,blockedOpen=false;
let daySections=[],jobCards=[];
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
  if(top50Title)top50Title.textContent="Top 30 by postings · "+(mode==="all"?"ALL":mode);
  if(top50Rows.length)renderTop50(top50Rows,top50Mode);
}
top50Tabs?.addEventListener("click",e=>{const b=e.target.closest(".top50-tab");if(b)setTop50Mode(b.dataset.topRegion);});
function setDensity(d){
  const c=d==="compact";
  document.body.classList.toggle("compact",c);
  dbtn.classList.toggle("active",c);
  localStorage.setItem("density",d);
}
setDensity(localStorage.getItem("density")||"comfortable");
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
function renderTop50(rows,mode="all"){
  const host=document.getElementById('top50');
  if(!host)return;
  const now=Date.now();
  const scoped=mode==="all"?rows:rows.filter(j=>norm(j.location)===mode);
  const counts=new Map();
  scoped.forEach(j=>{
    const name=(j.company||'未知机构').trim();
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
  const H=470,left=70,plotRight=500,topY=12,bottom=28,plotTop=12,plotBottom=442,annotationX=507;
  const labelWidth=s=>[...String(s||'')].reduce((w,ch)=>w+(ch.charCodeAt(0)>255?7.2:4.15),0);
  const railWidth=Math.max(112,...top.map(([name])=>labelWidth(name)));
  const W=Math.max(660,Math.min(860,annotationX+railWidth+14));
  const means=top.map(([,d])=>d.ages.reduce((a,b)=>a+b,0)/d.ages.length);
  const medians=top.map(([,d])=>{const a=[...d.ages].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;});
  const domainMax=Math.max(50,Math.ceil(Math.max(...means,...medians)/5)*5);
  const xMin=0,xMax=domainMax,yMax=domainMax;
  const x=v=>left+(plotRight-left)*(v/domainMax);
  const y=v=>plotBottom-(plotBottom-plotTop)*(v/domainMax);
  const xTicks=Array.from({length:domainMax/10+1},(_,i)=>i*10);
  const yTicks=Array.from({length:domainMax/10+1},(_,i)=>i*10);
  const grid=xTicks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+x(v).toFixed(1)+'" y1="'+plotTop+'" x2="'+x(v).toFixed(1)+'" y2="'+plotBottom+'"/>')+'<text class="bubble-axis" x="'+x(v).toFixed(1)+'" y="'+(plotBottom+17)+'" text-anchor="middle">'+v+'</text>').join('')+
    yTicks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+left+'" y1="'+y(v).toFixed(1)+'" x2="'+plotRight+'" y2="'+y(v).toFixed(1)+'"/>')+'<text class="bubble-axis" x="'+(left-9)+'" y="'+(y(v)+3).toFixed(1)+'" text-anchor="end">'+v+'</text>').join('');
  const pointData=top.map(([name,item],i)=>{
    const ages=[...item.ages].sort((a,b)=>a-b),n=ages.length;
    const mean=ages.reduce((a,b)=>a+b,0)/n;
    const median=n%2?ages[(n-1)/2]:(ages[n/2-1]+ages[n/2])/2;
    const tier=Math.min(5,Math.floor(i/5));
    const palette=['#F5572F','#D4A017','#ACAD79','#7096D1','#334EAC','#081F5C'];
    const gray=palette[tier],labelInk=tier>=4?'#1C1C1A':'#F0EFEB';
    const r=3+Math.sqrt(item.total/Math.max(1,top[0][1].total))*8.2;
      return {name,item,i,mean,median,gray,labelInk,r,px:x(mean),py:y(median),label:name};
  });
  const labelOrder=[...pointData].sort((a,b)=>a.py-b.py||a.px-b.px);
  const labelSlots=[];
  labelOrder.forEach((p,i)=>{const prev=labelSlots[i-1];labelSlots.push(Math.max(plotTop+5,p.py,prev==null?-Infinity:prev+7.8));});
  const overflow=labelSlots[labelSlots.length-1]-(plotBottom-5);
  if(overflow>0) for(let i=0;i<labelSlots.length;i++) labelSlots[i]-=overflow;
  const labelY=new Map(labelOrder.map((p,i)=>[p.name,labelSlots[i]]));
  const points=pointData.map((p)=>{
    const {name,item,i,mean,median,gray,labelInk,r,px,py,label}=p;
    const ly=labelY.get(name),lineX=annotationX-7;
    const title=escSvg(name)+' · '+item.total+' 个职位 · 平均 '+mean.toFixed(1)+' 天 · 中位 '+median.toFixed(1)+' 天';
    return '<g class="bubble-row" data-company="'+escSvg(name)+'" data-total="'+item.total+'" data-mean="'+mean.toFixed(2)+'" data-median="'+median.toFixed(2)+'" style="--i:'+i+'"><line class="bubble-label-leader" x1="'+px.toFixed(1)+'" y1="'+py.toFixed(1)+'" x2="'+lineX+'" y2="'+ly.toFixed(1)+'"/><circle class="bubble-point" cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+gray+'"><title>'+title+'</title></circle><text class="bubble-company" x="'+annotationX+'" y="'+ly.toFixed(1)+'" text-anchor="start">'+escSvg(label)+'</text><text class="bubble-total" fill="'+labelInk+'" x="'+px.toFixed(1)+'" y="'+(py+2.5).toFixed(1)+'" text-anchor="middle">'+item.total+'</text></g>';
  }).join('');
  const diagonal='<line class="bubble-diagonal" x1="'+x(0)+'" y1="'+y(0)+'" x2="'+x(domainMax)+'" y2="'+y(domainMax)+'"/><text class="bubble-relation bubble-relation-above" x="'+x(7)+'" y="'+y(11)+'" text-anchor="middle">MEDIAN &gt; AVERAGE</text><text class="bubble-relation bubble-relation-below" x="'+x(7)+'" y="'+y(4)+'" text-anchor="middle">AVERAGE &gt; MEDIAN</text>';
  host.innerHTML='<svg class="top20-svg bubble-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Top 30 机构平均 first seen 天数、中位数与职位数量彩色气泡图">'+grid+diagonal+'<text class="bubble-x-title" x="'+((left+plotRight)/2)+'" y="'+(H-1)+'" text-anchor="middle">AVG DAYS SINCE FIRST SEEN</text><text class="bubble-y-title" x="30" y="'+((plotTop+plotBottom)/2)+'" text-anchor="middle" transform="rotate(-90 30 '+((plotTop+plotBottom)/2)+')">MEDIAN DAYS</text>'+points+'</svg>';
  requestAnimationFrame(()=>host.classList.add('is-ready'));
}
jobsEl.innerHTML=Array.from({length:6}).map(()=>'<div class="sk"><div class="sk-box sk-mono"></div><div><div class="sk-box sk-l1"></div><div class="sk-box sk-l2"></div></div></div>').join("");
// n8n 直接覆盖 jobs.json；使用稳定 URL，并让浏览器条件验证缓存（ETag/Last-Modified）。
fetch("jobs.json",{cache:"no-cache"})
  .then(r=>r.json())
  .then(async data=>{
    if(!Array.isArray(data))data=[];
      const norm2=s=>(s||"").trim().toLowerCase().replace(/\s+/g," ");
      const byKey=new Map();
      data.forEach(j=>{
        const k=norm2(j.title)+"|"+norm2(j.company)+"|"+norm(j.location);
        const fs=new Date(j.firstSeen||j.pushTime).getTime();
        const pt=new Date(j.pushTime||j.firstSeen).getTime();
        const prev=byKey.get(k);
        if(!prev){byKey.set(k,{rep:j,fs,pt});return;}
        byKey.set(k,{rep:pt>=prev.pt?j:prev.rep,fs:Math.min(fs,prev.fs),pt:Math.max(pt,prev.pt)});
      });
      data=[...byKey.values()].map(v=>Object.assign({},v.rep,{firstSeen:isNaN(v.fs)?v.rep.firstSeen:new Date(v.fs).toISOString(),pushTime:isNaN(v.pt)?v.rep.pushTime:new Date(v.pt).toISOString()}));
    const companyRegionCount=new Map();
    data.forEach(j=>{const k=(j.company||"")+"\x00"+norm(j.location);companyRegionCount.set(k,(companyRegionCount.get(k)||0)+1);});
    jobsEl.innerHTML="";
    animNum(document.getElementById("stat-total"),4485);
    const companies=[...new Set(data.map(j=>j.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hans-CN"));
    animNum(document.getElementById("stat-comp"),736);
    const lastUpd=data.reduce((m,j)=>{const t=j.pushTime||j.firstSeen||"";return t>m?t:m;},"");
    document.getElementById("stat-updated").textContent="08/16 18:02";
    companies.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;companyEl.appendChild(o);});
    const rc={CN:0,HK:0,SG:0,OTHER:0};data.forEach(j=>rc[norm(j.location)]++);
    const rmax=Math.max(...Object.values(rc),1);
    const distEl=document.getElementById("dist");
    const regionOrder=["CN","HK","SG","OTHER"].filter(k=>rc[k]>0);
    const regionRecords=Object.fromEntries(regionOrder.map(k=>[k,data.filter(j=>norm(j.location)===k).map(j=>({j,t:new Date(seenAt(j))})).filter(x=>!isNaN(x.t)).sort((a,b)=>a.t-b.t)]));
    const allTimes=regionOrder.flatMap(k=>regionRecords[k].map(x=>x.t.getTime()));
    const tMin=Math.min(...allTimes),tMax=Math.max(...allTimes),tSpan=Math.max(1,tMax-tMin);
    const TW=520,TH=126,left=72,right=76,top=27,rowGap=27,plotW=TW-left-right,bins=40,cellW=plotW/bins;
    const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const bucketCounts=regionOrder.map(k=>Array.from({length:bins},()=>0));
    regionOrder.forEach((k,ri)=>regionRecords[k].forEach(x=>{const bi=Math.min(bins-1,Math.floor((x.t.getTime()-tMin)/tSpan*bins));bucketCounts[ri][bi]++;}));
    const maxBucket=Math.max(1,...bucketCounts.flat());
    const monthStart=new Date(tMin);monthStart.setHours(0,0,0,0);monthStart.setDate(1);const monthSegments=[];for(let d=new Date(monthStart);d.getTime()<tMax;d.setMonth(d.getMonth()+1)){const next=new Date(d);next.setMonth(next.getMonth()+1);const segStart=Math.max(tMin,d.getTime()),segEnd=Math.min(tMax,next.getTime());if(segEnd<=segStart)continue;const x1=left+((segStart-tMin)/tSpan)*plotW,x2=left+((segEnd-tMin)/tSpan)*plotW,label=d.toLocaleDateString('en-US',{month:'short'}).toUpperCase();monthSegments.push('<line class="region-month-boundary" x1="'+x1.toFixed(1)+'" y1="'+(top-11)+'" x2="'+x1.toFixed(1)+'" y2="'+(top+rowGap*2+10)+'"/><text class="region-month-label" x="'+((x1+x2)/2).toFixed(1)+'" y="'+(TH-5)+'">'+label+'</text>');}monthSegments.push('<line class="region-month-boundary" x1="'+(left+plotW).toFixed(1)+'" y1="'+(top-11)+'" x2="'+(left+plotW).toFixed(1)+'" y2="'+(top+rowGap*2+10)+'"/>');const axisTicks=monthSegments.join('');
    const rows=regionOrder.map((k,ri)=>{const y=top+ri*rowGap,pct=data.length?Math.round(rc[k]/data.length*100):0,rowMax=Math.max(1,...bucketCounts[ri]);const cells=bucketCounts[ri].map((n,i)=>{const x=left+i*cellW,w=cellW,ratio=n/rowMax,level=n===0?0:ratio<=0.12?1:ratio<=0.32?2:ratio<=0.62?3:4,alpha=[0.12,0.26,0.52,0.80,1][level];const from=new Date(tMin+i*tSpan/bins),to=new Date(tMin+(i+1)*tSpan/bins);return '<rect class="region-density density-'+level+' '+k.toLowerCase()+'" x="'+x.toFixed(2)+'" y="'+(y-6)+'" width="'+w.toFixed(2)+'" height="12" rx="0" opacity="'+alpha.toFixed(3)+'"><title>'+escSvg(from.toLocaleDateString('zh-CN'))+'–'+escSvg(to.toLocaleDateString('zh-CN'))+' · '+escSvg(REGIONS[k].label)+' · '+n+' 个职位</title></rect>';}).join('');return '<line class="region-time-baseline" x1="'+left+'" y1="'+y+'" x2="'+(left+plotW)+'" y2="'+y+'"/><text class="region-time-name" x="0" y="'+(y+3)+'">'+escSvg(REGIONS[k].label)+'</text><text class="region-time-count" x="'+(TW-1)+'" y="'+(y+3)+'">'+rc[k].toLocaleString()+'<tspan> '+pct+'%</tspan></text>'+cells;}).join('');
    distEl.innerHTML='<svg class="region-time-svg" viewBox="0 0 '+TW+' '+TH+'" role="img" aria-label="三条地区横向时间分布；色带深浅表示时间窗口内职位密度">'+axisTicks+rows+'</svg>';
    /* 近 30 日招聘节奏 · 一日一点，折线与日刻度 */
    const RKEYS=["OTHER","SG","HK","CN"];
    const rcounts={};data.forEach(j=>{const k=dayKey(seenAt(j));const r=norm(j.location);(rcounts[k]=rcounts[k]||{})[r]=(rcounts[k][r]||0)+1;});
    const today=new Date(),days=[];
    for(let i=29;i>=0;i--){const d=new Date(today);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=keyOf(d),rc=rcounts[key]||{};days.push({date:d,label:d.toLocaleDateString("en-US",{month:"short",day:"numeric"}).toUpperCase(),weekend:d.getDay()===0||d.getDay()===6,rc,total:RKEYS.reduce((s,r)=>s+(rc[r]||0),0)});}
    const smax=Math.max(...days.map(d=>d.total),1),peak=Math.max(...days.map(d=>d.total));
    const SW=520,SH=154,sLeft=28,sRight=22,sTop=16,sBase=118,sPlotW=SW-sLeft-sRight,sPlotH=sBase-sTop;
    const sx=i=>sLeft+(i/(days.length-1))*sPlotW;
    const sy=v=>sBase-(v/smax)*sPlotH;
    const points=days.map((d,i)=>sx(i).toFixed(1)+','+sy(d.total).toFixed(1)).join(' ');
    const sticks=days.map((d,i)=>{const x=sx(i).toFixed(1),y=sy(d.total).toFixed(1);return '<line class="rhythm-stick'+(d.weekend?' weekend':'')+'" x1="'+x+'" y1="'+sBase+'" x2="'+x+'" y2="'+y+'"/><line class="rhythm-tick'+(d.weekend?' weekend':'')+'" x1="'+x+'" y1="'+(sBase+2)+'" x2="'+x+'" y2="'+(sBase+9)+'"/>';}).join('');
    const nodes=days.map((d,i)=>{const x=sx(i).toFixed(1),y=sy(d.total).toFixed(1),isPeak=d.total===peak,isCurrent=i===days.length-1,focus=isPeak||isCurrent;return '<circle class="rhythm-node '+(d.weekend?'weekend ':'')+(focus?'focus':'')+'" cx="'+x+'" cy="'+y+'" r="'+(focus?4.6:3.2)+'"><title>'+d.label+' · '+d.total+' 个职位</title></circle>'+(focus?'<text class="rhythm-value" x="'+x+'" y="'+(Math.max(10,sy(d.total)-10)).toFixed(1)+'" text-anchor="middle">'+d.total+'</text>':'');}).join('');
    const axis=[0,14,29].map(i=>'<text class="rhythm-axis-label" x="'+sx(i).toFixed(1)+'" y="'+(SH-8)+'" text-anchor="'+(i===0?'start':i===29?'end':'middle')+'">'+days[i].label+'</text>').join('');
    const sparkEl=document.getElementById("spark");
    sparkEl.innerHTML='<svg class="rhythm-svg" viewBox="0 0 '+SW+' '+SH+'" role="img" aria-label="近 30 日每日新增职位招聘节奏折线图"><line class="rhythm-baseline" x1="'+sLeft+'" y1="'+sBase+'" x2="'+(SW-sRight)+'" y2="'+sBase+'"/>'+sticks+'<polyline class="rhythm-line" points="'+points+'"/>'+nodes+axis+'</svg>';
    requestAnimationFrame(()=>sparkEl.classList.add('is-ready'));
    top50Rows=data;
    renderTop50(top50Rows,top50Mode);
    const groups=new Map();
    data.forEach(j=>{const t=placeAt(j);const k=dayKey(t);if(!groups.has(k))groups.set(k,{label:dayLabel(t),items:[]});groups.get(k).items.push(j);});
    const orderedGroups=[...groups.entries()].sort((a,b)=>{if(a[0]==="—")return 1;if(b[0]==="—")return -1;return a[0]<b[0]?1:a[0]>b[0]?-1:0;});
    orderedGroups.forEach(([,g])=>{g.items.sort((x,y)=>{const tx=new Date(placeAt(x)).getTime()||0,ty=new Date(placeAt(y)).getTime()||0;return ty-tx;});});
    const renderGroups=[];
    orderedGroups.forEach(([key,g])=>{for(let i=0;i<g.items.length;i+=120)renderGroups.push([key,{label:g.label,items:g.items.slice(i,i+120),continuation:i>0}]);});
    let first=true;
    for(const[,g]of renderGroups){
      if(!first)await new Promise(resolve=>setTimeout(resolve,0));
      const sec=document.createElement("section");sec.className="day";const rowEstimate=document.body.classList.contains("compact")?50:78;sec.style.containIntrinsicSize="0 "+(44+g.items.length*rowEstimate)+"px";daySections.push(sec);
      const head=g.continuation?'':'<div class="day-head"><span class="day-date">'+esc(g.label)+'</span><span class="day-meta tnum" data-role="daycount">'+g.items.length+' 个职位</span>'+(first?'<span class="day-new">Latest</span>':'')+'</div>';
      const rows=[];
      g.items.forEach((job,idx)=>{
        const r=norm(job.location),lvl=levelOf(job.title),id=jobId(job.link)||(job.title+"|"+job.company),_ad=ageDays(seenAt(job));
        const _coKey=job.company?job.company+"\x00"+r:"";const _coCnt=_coKey?companyRegionCount.get(_coKey)||1:0;const _coHtml=_coCnt>0?'<span class="co-count">· '+_coCnt+'</span>':'';
        const delay=first&&!reduce?' style="animation-delay:'+Math.min(idx*.03,.45)+'s"':'';
        rows.push('<article class="job'+(reads.has(id)?' read':'')+'" data-region="'+r+'" data-comp="'+esc(job.company||'')+'" data-level="'+lvl+'" data-age="'+(_ad==null?'':_ad)+'" data-id="'+esc(id)+'" data-search="'+esc(((job.title||'')+' '+(job.company||'')).toLowerCase())+'" data-title="'+esc((job.title||'').toLowerCase())+'"'+delay+'><div class="mono">'+esc(monogram(job.company))+'</div><div class="job-main"><a class="job-title" href="'+esc(job.link)+'" target="_blank" rel="noopener">'+esc(job.title)+'</a><div class="job-sub'+(job.company?' job-sub-link':'')+'"'+(job.company?' role="button" tabindex="0" title="查看'+esc(job.company)+'的全部职位"':'')+'>'+esc(job.company||"未知机构")+_coHtml+'</div></div><div class="job-right">'+(_ad!=null?'<span class="age">'+(_ad===0?'今天':_ad<=7?'1周内':_ad<=14?'2周内':_ad<=21?'3周内':'3周+')+'</span>':'')+(lvl!=="Other"?'<span class="lvl">'+lvl+'</span>':'')+'<span class="tag">'+r+'</span><button class="icon-btn star'+(favs.has(id)?' on':'')+'" aria-label="收藏" title="'+(favs.has(id)?'取消收藏':'收藏')+'"></button><button class="icon-btn ban" aria-label="屏蔽机构" title="屏蔽该机构"></button></div></article>');
      });
      sec.innerHTML=head+rows.join('');
      sec._jobCards=[...sec.querySelectorAll('.job')];
      jobCards.push(...sec._jobCards);
      jobsEl.appendChild(sec);first=false;
    }
    regionsEl.addEventListener("click",e=>{const b=e.target.closest(".seg");if(!b)return;regionsEl.querySelectorAll(".seg").forEach(x=>{x.classList.remove("active");x.setAttribute("aria-selected","false");});b.classList.add("active");b.setAttribute("aria-selected","true");activeRegion=b.dataset.region;apply();});
    favEl.addEventListener("click",()=>{favOnly=!favOnly;favEl.classList.toggle("active",favOnly);apply();});
    let _searchTimer=null;
    searchEl.addEventListener("input",()=>{
      clearTimeout(_searchTimer);
      if(searchEl.value===""){apply();}
      else{_searchTimer=setTimeout(apply,200);}
    });
    companyEl.addEventListener("change",apply);
    ageEl.addEventListener("change",apply);
    apply();
  })
  .catch(()=>{jobsEl.innerHTML="";emptyEl.classList.add("show");emptyEl.querySelector(".big").textContent="职位数据加载失败";});
function apply(){
  const q=searchEl.value.trim().toLowerCase(),comp=companyEl.value,ageSel=ageEl.value,kwArr=[...blockedKw];
  companyEl.classList.toggle("on",comp!=="all");ageEl.classList.toggle("on",ageSel!=="all");
  compClear.classList.toggle("show",comp!=="all");compClear.parentElement.classList.toggle("filtering",comp!=="all");
  let visible=0;
  const coAges=[],coRegions={};
  daySections.forEach(sec=>{
    let shown=0;
    sec._jobCards.forEach(card=>{
      const age=card.dataset.age===""?null:+card.dataset.age;
      /* base：除“发布时间”之外的全部筛选条件。机构统计以 base 为样本，
         因此选中某一时间区间时，分布图仍然完整，不会塌缩为单根柱子。 */
      const base=!blocked.has(card.dataset.comp)&&(kwArr.length===0||!kwArr.some(k=>card.dataset.title.includes(k)))&&(activeRegion==="all"||card.dataset.region===activeRegion)&&(comp==="all"||card.dataset.comp===comp)&&(!favOnly||favs.has(card.dataset.id))&&(!q||card.dataset.search.includes(q));
      const ok=base&&ageMatch(ageSel,age);
      if(base&&comp!=="all"&&age!=null){coAges.push(age);coRegions[card.dataset.region]=(coRegions[card.dataset.region]||0)+1;}
      card.classList.toggle("hidden",!ok);if(ok)shown++;
    });
    const c=sec.querySelector('[data-role="daycount"]');if(c)c.textContent=shown+" 个职位";
    sec.style.display=shown?"":"none";visible+=shown;
  });
  countEl.innerHTML="显示 <b>"+visible+"</b> 个职位";
  emptyEl.classList.toggle("show",visible===0);
  if(typeof renderCo==="function")renderCo(comp==="all"?null:comp,coAges,coRegions,ageSel);
}
document.addEventListener("keydown",e=>{
  const tag=(e.target.tagName||"").toLowerCase();
  if(tag==="input"||tag==="select"||tag==="textarea")return;
  if(e.key==="/"){e.preventDefault();searchEl.focus();}
  else if(e.key.toLowerCase()==="t"){setTheme(document.documentElement.getAttribute("data-theme")==='dark'?'light':'dark');}
});
const totop=document.getElementById("totop");
addEventListener("scroll",()=>{totop.classList.toggle("show",window.scrollY>600);},{passive:true});
totop.addEventListener("click",()=>scrollTo({top:0,behavior:"smooth"}));
