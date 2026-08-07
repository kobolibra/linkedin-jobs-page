/*
 * LinkedIn 金融职位精选 · 机构统计面板 Company Insight
 * 由 app.js 的 apply() 在每次筛选后调用：renderCo(company, ages, regions, ageSel)
 * 依赖 app.js 暴露的 REGIONS / monogram / companyEl / ageEl / apply
 */
(function(){
  const panel=document.getElementById("coPanel");
  if(!panel)return;
  const $=id=>document.getElementById(id);
  const elName=$("coName"),elMono=$("coMono"),elRegions=$("coRegions"),
        elCount=$("coCount"),elFresh=$("coFresh"),elMed=$("coMed"),elMean=$("coMean"),
        elHist=$("coHist"),elAxisSec=$("coAxisSec"),elPlot=$("coPlot"),elScale=$("coScale"),
        elSig=$("coSig"),elClose=$("coClose");
  const BUCKETS=[
    {v:"0",    label:"今天",    hit:d=>d===0,             tier:"fresh"},
    {v:"1-7",  label:"1 周内",  hit:d=>d>=1&&d<=7,        tier:"fresh"},
    {v:"8-14", label:"2 周内",  hit:d=>d>=8&&d<=14,       tier:"mid"},
    {v:"15-21",label:"3 周内",  hit:d=>d>=15&&d<=21,      tier:"stale"},
    {v:"22+",  label:"3 周+",   hit:d=>d>=22,             tier:"stale"}
  ];
  const quant=(a,p)=>{const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};
  const num=n=>{const r=Math.round(n*10)/10;return Number.isInteger(r)?String(r):r.toFixed(1);};
  function hide(){panel.classList.remove("on","in");document.body.classList.remove("co-open");}

  function render(comp,ages,regions,ageSel){
    if(!comp||!ages||!ages.length){hide();return;}

    const s=ages.slice().sort((a,b)=>a-b),n=s.length;
    const mean=s.reduce((x,y)=>x+y,0)/n,med=quant(s,.5),q1=quant(s,.25),q3=quant(s,.75),hi=s[n-1];

    /* ── 抬头 ── */
    if(elMono)elMono.textContent=monogram(comp);
    elName.textContent=comp;elName.title=comp;
    elRegions.innerHTML=Object.keys(REGIONS).filter(k=>regions&&regions[k]).map(k=>
      '<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+regions[k]+'</span>').join("");

    /* ── KPI 四指标 ── */
    const freshN=s.filter(d=>d<=6).length;
    elCount.textContent=n;
    elFresh.innerHTML=freshN+'<small>'+Math.round(freshN/n*100)+'%</small>';
    elMed.innerHTML=num(med)+'<small>天</small>';
    elMean.innerHTML=num(mean)+'<small>天</small>';

    /* ── 直方图（三层色彩编码）── */
    const counts=BUCKETS.map(b=>s.filter(d=>b.hit(d)).length),cmax=Math.max.apply(null,counts.concat(1));
    elHist.innerHTML=BUCKETS.map((b,i)=>{
      const c=counts[i],act=ageSel===b.v;
      let cls=(c?"":" empty")+(act?" active":"");
      if(b.tier==="fresh")cls+=" fresh";
      else if(b.tier==="mid")cls+=" mid";
      else cls+=" stale";
      return '<button type="button" class="co-bar'+cls+'" data-age="'+b.v+'" aria-pressed="'+act+'"'
        +(c?'':' tabindex="-1" aria-disabled="true"')+' title="'+b.label+' · '+c+' 个职位">'
        +'<span class="co-bar-l">'+b.label+'</span>'
        +'<span class="co-bar-t"><span class="co-bar-f" data-w="'+(c/cmax*100)+'"></span></span>'
        +'<span class="co-bar-v tnum">'+c+'</span>'
        +'<span class="co-bar-p tnum">'+(c?Math.round(c/n*100)+"%":"—")+'</span></button>';
    }).join("");

    /* ── 分布轴 ── */
    if(n>=3){
      elAxisSec.style.display="";
      const span=Math.max(hi,1),pos=d=>d/span*100;
      elPlot.innerHTML='<span class="co-band" style="left:'+pos(q1)+'%;width:'+Math.max(pos(q3)-pos(q1),1.5)+'%"></span>'
        +s.map(d=>'<span class="co-tick" style="left:'+pos(d)+'%"></span>').join("")
        +'<span class="co-mk co-mean" style="left:'+pos(mean)+'%"></span>'
        +'<span class="co-mk co-med" style="left:'+pos(med)+'%"></span>';
      elScale.innerHTML='<span>0 天</span><span>'+span+' 天</span>';
    }else{
      elAxisSec.style.display="none";
    }

    /* ═══════════════════════════════════════════
       招聘信号：对这家公司自身分布的解读
       - 一个结论（色彩分级）+ 一条决定性证据
       - 近 7 日新发节奏条（今天 → 6 天前）
       - 一句数据驱动的阅读指引
       原则：只基于该公司自己的数据下结论；
       证据给最关键的，绝不逐桶罗列。
       ═══════════════════════════════════════════ */
    const pct=x=>Math.round(x*100)+"%";
    const fresh=s.filter(d=>d<=6).length/n;
    const mid=(s.filter(d=>d>=8&&d<=21).length)/n;
    const stale=1-fresh-mid;
    const score=Math.round(fresh*100+mid*55);

    /* 分级：活跃 → 正常 → 偏慢 → 堆积 → 样本有限 */
    let tier,verdict,sentence,guide;
    if(n<4){
      tier="none";verdict="样本有限";
      sentence="仅 "+n+" 个职位，统计意义有限。";
      guide="职位数不足，暂不做趋势判断。";
    }else if(score>=50||fresh>=.45){
      tier="good";verdict="招聘活跃";
      sentence="近 7 日新增 "+freshN+" 个职位（"+pct(fresh)+"），中位仅 "+num(med)+" 天，招聘通道保持活跃。";
      guide="投递窗口新鲜，建议按发布时间排序优先跟进新发职位。";
    }else if(stale>=.75){
      tier="bad";verdict="存量堆积";
      sentence=pct(stale)+" 职位已挂单超 3 周，近 7 日仅新增 "+freshN+" 个（"+pct(fresh)+"）。";
      guide="以长期挂单为主，反馈周期可能较长，建议只关注 7 日内新发职位。";
    }else if(stale>=.55||score<=22){
      tier="mid";verdict="节奏偏慢";
      sentence="近 7 日新增 "+freshN+" 个（"+pct(fresh)+"），"+pct(stale)+" 职位已挂单超 3 周。";
      guide="存量挂单较多，反馈可能滞后，优先考虑 7 日内新发职位。";
    }else{
      tier="ok";verdict="节奏正常";
      sentence="近 7 日新增 "+freshN+" 个（"+pct(fresh)+"），中位 "+num(med)+" 天，新发与存量较为均衡。";
      guide="节奏平稳，按正常节奏投递即可。";
    }

    /* 近 7 日新发节奏条：今天 → 6 天前，每天新增职位数 */
    const rhythm=(()=>{
      if(n<4)return"";
      const days=[];
      for(let i=0;i<7;i++)days.push(s.filter(d=>d===i).length);
      const mx=Math.max.apply(null,days.concat(1));
      const dayTxt=["今天","昨天","2 天前","3 天前","4 天前","5 天前","6 天前"];
      return '<div class="co-rhythm">'
        +'<div class="co-rhythm-head"><span>近 7 日新发节奏</span><b class="tnum">'+freshN+' 个</b></div>'
        +'<div class="co-rhythm-bars">'
        +days.map((c,i)=>'<div class="co-rd'+(c?"":" empty")+'" title="'+(c?c+" 个职位 · "+dayTxt[i]:"无 · "+dayTxt[i])+'">'
          +'<span class="co-rd-f" data-h="'+(c/mx*100)+'"></span><em>'+(i===0?"今":i)+'</em></div>').join("")
        +'</div></div>';
    })();

    elSig.className="co-sig "+tier;
    elSig.innerHTML=rhythm
      +'<div class="co-verd"><span class="co-verd-dot"></span><b class="co-verd-t">'+verdict+'</b>'
      +'<p class="co-verd-s">'+sentence+'</p></div>'
      +'<p class="co-guide"><span class="co-guide-arr">→</span>'+guide+'</p>';

    panel.classList.add("on");document.body.classList.add("co-open");
    requestAnimationFrame(()=>{
      panel.classList.add("in");
      elHist.querySelectorAll(".co-bar-f").forEach(f=>{f.style.width=f.dataset.w+"%";});
      elSig.querySelectorAll(".co-rd-f").forEach(f=>{f.style.height=f.dataset.h+"%";});
    });
  }

  /* ── 交互 ── */
  elHist.addEventListener("click",e=>{
    const b=e.target.closest(".co-bar");
    if(!b||b.classList.contains("empty"))return;
    ageEl.value=ageEl.value===b.dataset.age?"all":b.dataset.age;
    apply();
  });
  elClose.addEventListener("click",()=>{companyEl.value="all";apply();});
  window.renderCo=render;
})();