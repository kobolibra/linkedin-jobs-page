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
        elFoot=$("coFoot"),elClose=$("coClose");
  const BUCKETS=[
    {v:"0",    label:"今天",    hit:d=>d===0,             tier:"fresh"},
    {v:"1-7",  label:"1 周内",  hit:d=>d>=1&&d<=7,        tier:"fresh"},
    {v:"8-14", label:"2 周内",  hit:d=>d>=8&&d<=14,       tier:"mid"},
    {v:"15-21",label:"3 周内",  hit:d=>d>=15&&d<=21,      tier:"stale"},
    {v:"22+",  label:"3 周+",   hit:d=>d>=22,             tier:"stale"}
  ];
  const quant=(a,p)=>{const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};
  const num=n=>{const r=Math.round(n*10)/10;return Number.isInteger(r)?String(r):r.toFixed(1);};
  const dayText=d=>d===0?"今天":d+" 天前";
  function hide(){panel.classList.remove("on","in");document.body.classList.remove("co-open");}

  function render(comp,ages,regions,ageSel){
    if(!comp||!ages||!ages.length){hide();return;}

    const s=ages.slice().sort((a,b)=>a-b),n=s.length;
    const mean=s.reduce((x,y)=>x+y,0)/n,med=quant(s,.5),q1=quant(s,.25),q3=quant(s,.75),lo=s[0],hi=s[n-1];

    /* ── 抬头 ── */
    if(elMono)elMono.textContent=monogram(comp);
    elName.textContent=comp;elName.title=comp;
    elRegions.innerHTML=Object.keys(REGIONS).filter(k=>regions&&regions[k]).map(k=>
      '<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+regions[k]+'</span>').join("");

    /* ── KPI 四指标 ── */
    const freshN=s.filter(d=>d<=7).length;
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
       客观数据摘要：只说事实，不做解读
       ═══════════════════════════════════════════ */
    const pct=x=>Math.round(x*100)+"%";
    const skew=med>0?mean/med:1;
    let note='';

    if(n<4){
      note='<p class="co-note">样本较少（'+n+' 个职位），统计指标仅供参考。</p>';
    }else{
      /* 分布概览：各段占比 + 中位/平均 + 偏态 */
      const f1w=pct(freshN/n),f2w=pct(s.filter(d=>d>=8&&d<=14).length/n),f3w=pct(s.filter(d=>d>=15&&d<=21).length/n),f3wp=pct(s.filter(d=>d>=22).length/n);
      note='<p class="co-note">1周内 '+f1w+'，2周内 '+f2w+'，3周内 '+f3w+'，3周+ '+f3wp+'。';
      note+='中位 '+num(med)+' 天，平均 '+num(mean)+' 天';
      if(skew>1.3)note+='（均值/中位='+num(skew)+'，分布右偏）。</p>';
      else if(skew<.85)note+='（均值/中位='+num(skew)+'，分布左偏）。</p>';
      else note+='（均值/中位='+num(skew)+'）。</p>';
    }

    elFoot.innerHTML='<div class="co-facts">'
      +'<div class="co-fact"><span class="co-fact-k">最新</span><b>'+dayText(lo)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">最早</span><b>'+dayText(hi)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">中间 50%</span><b>'+num(q1)+' – '+num(q3)+' 天</b></div>'
      +'</div>'
      +note;

    panel.classList.add("on");document.body.classList.add("co-open");
    requestAnimationFrame(()=>{
      panel.classList.add("in");
      elHist.querySelectorAll(".co-bar-f").forEach(f=>{f.style.width=f.dataset.w+"%";});
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