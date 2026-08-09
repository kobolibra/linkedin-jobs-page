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
const kwToggle=document.getElementById("kwToggle"),kwPanel=document.getElementById("kwPanel"),kwForm=document.getElementById("kwForm"),kwInput=document.getElementById("kwInput"),kwList=document.getElementById("kwList");
let activeRegion="all",favOnly=false,blockedOpen=false;
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
jobsEl.innerHTML=Array.from({length:6}).map(()=>'<div class="sk"><div class="sk-box sk-mono"></div><div><div class="sk-box sk-l1"></div><div class="sk-box sk-l2"></div></div></div>').join("");
fetch("jobs.json?_="+Date.now())
  .then(r=>r.json())
  .then(data=>{
    if(!Array.isArray(data))data=[];
    (function(){
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
    })();
    const companyRegionCount=new Map();
    data.forEach(j=>{const k=(j.company||"")+"\x00"+norm(j.location);companyRegionCount.set(k,(companyRegionCount.get(k)||0)+1);});
    jobsEl.innerHTML="";
    animNum(document.getElementById("stat-total"),data.length);
    const companies=[...new Set(data.map(j=>j.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hans-CN"));
    animNum(document.getElementById("stat-comp"),companies.length);
    const lastUpd=data.reduce((m,j)=>{const t=j.pushTime||j.firstSeen||"";return t>m?t:m;},"");
    if(lastUpd){const d=new Date(lastUpd);if(!isNaN(d))document.getElementById("stat-updated").innerHTML='<span style="font-size:15px">'+d.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+'</span>';}
    companies.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;companyEl.appendChild(o);});
    const rc={CN:0,HK:0,SG:0,OTHER:0};data.forEach(j=>rc[norm(j.location)]++);
    const rmax=Math.max(...Object.values(rc),1);
    const distEl=document.getElementById("dist");
    const regionOrder=["CN","SG","HK","OTHER"];
    distEl.innerHTML=regionOrder.filter(k=>rc[k]>0).map(k=>{const pct=data.length?Math.round(rc[k]/data.length*100):0;return'<div class="dist-row" data-region="'+k+'"><span class="dist-label">'+REGIONS[k].label+'</span><div class="dist-track"><div class="dist-fill" data-w="'+(rc[k]/rmax*100)+'"></div></div><span class="dist-val tnum">'+rc[k]+'<small>'+pct+'%</small></span></div>';}).join("");
    requestAnimationFrame(()=>distEl.querySelectorAll(".dist-fill").forEach(f=>{f.style.width=f.dataset.w+"%";}));
    /* 近 7 日新增 · 按地区堆叠（柱间连续，无缝隙） */
    // DOM 顺序配合 column-reverse：CN 视觉最上、SG 居中、HK 最下
    const RKEYS=["OTHER","HK","SG","CN"];
    const rcounts={};data.forEach(j=>{const k=dayKey(seenAt(j));const r=norm(j.location);(rcounts[k]=rcounts[k]||{})[r]=(rcounts[k][r]||0)+1;});
    const today=new Date(),days=[];
    for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const key=keyOf(d),rc=rcounts[key]||{};days.push({label:d.toLocaleDateString("en-US",{weekday:"short"}),rc,total:RKEYS.reduce((s,r)=>s+(rc[r]||0),0)});}
    const smax=Math.max(...days.map(d=>d.total),1);
    const sparkEl=document.getElementById("spark");
    sparkEl.innerHTML=days.map((d,i)=>{
      /* DOM 顺序 CN→OTHER，配合 column-reverse 视觉自下而上 */
      let lastR=null;RKEYS.forEach(r=>{if((d.rc[r]||0)>0)lastR=r;});
      const segs=RKEYS.map(r=>{const c=d.rc[r]||0;return c?'<span class="spark-seg'+(r===lastR?' top':'')+'" data-region="'+r+'" style="flex-grow:'+c+'"></span>':'';}).join("");
      const bk=RKEYS.map(r=>{const c=d.rc[r]||0;return c?REGIONS[r].label+' '+c:'';}).filter(Boolean).join(' · ');
      return '<div class="spark-col'+(i===days.length-1?' today':'')+'" title="'+d.label+' · '+d.total+' 个'+(bk?'（'+bk+'）':'')+'">'
        +'<div class="spark-bar" data-h="'+(d.total/smax*100)+'">'+segs+(d.total?'<span class="spark-total">'+d.total+'</span>':'')+'</div>'
        +'<span class="spark-label">'+d.label+'</span></div>';
    }).join("");
    requestAnimationFrame(()=>sparkEl.querySelectorAll(".spark-bar").forEach(b=>{b.style.height=b.dataset.h+"%";}));
    const groups=new Map();
    data.forEach(j=>{const t=placeAt(j);const k=dayKey(t);if(!groups.has(k))groups.set(k,{label:dayLabel(t),items:[]});groups.get(k).items.push(j);});
    const orderedGroups=[...groups.entries()].sort((a,b)=>{if(a[0]==="—")return 1;if(b[0]==="—")return -1;return a[0]<b[0]?1:a[0]>b[0]?-1:0;});
    orderedGroups.forEach(([,g])=>{g.items.sort((x,y)=>{const tx=new Date(placeAt(x)).getTime()||0,ty=new Date(placeAt(y)).getTime()||0;return ty-tx;});});
    let first=true;
    for(const[,g]of orderedGroups){
      const sec=document.createElement("section");sec.className="day";
      const head=document.createElement("div");head.className="day-head";
      head.innerHTML='<span class="day-date">'+esc(g.label)+'</span><span class="day-meta tnum" data-role="daycount">'+g.items.length+' 个职位</span>'+(first?'<span class="day-new">Latest</span>':'');
      sec.appendChild(head);
      g.items.forEach((job,idx)=>{
        const r=norm(job.location),lvl=levelOf(job.title),id=jobId(job.link)||(job.title+"|"+job.company);
        const a=document.createElement("article");a.className="job"+(reads.has(id)?" read":"");
        if(first&&!reduce)a.style.animationDelay=Math.min(idx*.03,.45)+"s";
        const _ad=ageDays(seenAt(job));a.dataset.region=r;a.dataset.comp=job.company||"";a.dataset.level=lvl;a.dataset.age=(_ad==null?"":_ad);a.dataset.id=id;
        a.dataset.search=((job.title||"")+" "+(job.company||"")).toLowerCase();
        a.dataset.title=(job.title||"").toLowerCase();
        const _coKey=job.company?job.company+"\x00"+r:"";const _coCnt=_coKey?companyRegionCount.get(_coKey)||1:0;const _coHtml=_coCnt>0?'<span class="co-count">· '+_coCnt+'</span>':'';
        a.innerHTML='<div class="mono">'+esc(monogram(job.company))+'</div><div class="job-main"><a class="job-title" href="'+esc(job.link)+'" target="_blank" rel="noopener">'+esc(job.title)+'</a><div class="job-sub'+(job.company?' job-sub-link':'')+'"'+(job.company?' role="button" tabindex="0" title="查看'+esc(job.company)+'的全部职位"':'')+'>'+esc(job.company||"未知机构")+_coHtml+'</div></div><div class="job-right">'+(_ad!=null?'<span class="age">'+(_ad===0?"今天":_ad<=7?"1周内":_ad<=14?"2周内":_ad<=21?"3周内":"3周+")+'</span>':'')+(lvl!=="Other"?'<span class="lvl">'+lvl+'</span>':'')+'<span class="tag">'+r+'</span><button class="icon-btn star'+(favs.has(id)?" on":"")+'" aria-label="收藏" title="'+(favs.has(id)?"取消收藏":"收藏")+'">'+IC.star+'</button><button class="icon-btn ban" aria-label="屏蔽机构" title="屏蔽该机构">'+IC.ban+'</button></div>';
        a.querySelector(".job-title").addEventListener("click",()=>{reads.add(id);saveReads();a.classList.add("read");});
        const star=a.querySelector(".star");
        star.addEventListener("click",e=>{
          e.preventDefault();
          if(favs.has(id)){favs.delete(id);star.classList.remove("on");}
          else{favs.add(id);star.classList.add("on");}
          star.title=favs.has(id)?"取消收藏":"收藏";
          saveFavs();
          if(favOnly)apply();
        });
        const ban=a.querySelector(".ban");
        ban.addEventListener("click",e=>{e.preventDefault();const c=job.company;if(c){blocked.add(c);saveBlocked();renderBlocked();apply();}});
        const subEl=a.querySelector(".job-sub");
        if(job.company){
          const openCompany=()=>{companyEl.value=job.company;apply();const tb=document.querySelector(".toolbar");if(tb)tb.scrollIntoView({behavior:"smooth",block:"start"});};
          subEl.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openCompany();});
          subEl.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCompany();}});
        }
        sec.appendChild(a);
      });
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
  jobsEl.querySelectorAll(".day").forEach(sec=>{
    let shown=0;
    sec.querySelectorAll(".job").forEach(card=>{
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
