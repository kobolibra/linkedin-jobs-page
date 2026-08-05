/*
 * LinkedIn 金融职位精选 · 机构统计面板 Company Insight
 * 由 app.js 的 apply() 在每次筛选后调用：renderCo(company, ages, regions, ageSel)
 * 依赖 app.js 暴露的 REGIONS / monogram / companyEl / ageEl / apply
 */
(function(){
  const panel=document.getElementById("coPanel");
  if(!panel)return;
  const $=id=>document.getElementById(id);
  const elName=$("coName"),elMono=$("coMono"),elRegions=$("coRegions"),elCount=$("coCount"),elMean=$("coMean"),elMed=$("coMed"),elHist=$("coHist"),elAxisSec=$("coAxisSec"),elPlot=$("coPlot"),elScale=$("coScale"),elFoot=$("coFoot"),elClose=$("coClose");
  const BUCKETS=[
    {v:"0",label:"今天",hit:d=>d===0},
    {v:"1-3",label:"1–3 天",hit:d=>d>=1&&d<=3},
    {v:"4-7",label:"4–7 天",hit:d=>d>=4&&d<=7},
    {v:"8-14",label:"8–14 天",hit:d=>d>=8&&d<=14},
    {v:"15+",label:"15 天+",hit:d=>d>=15}
  ];
  const quant=(a,p)=>{const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};
  const num=n=>{const r=Math.round(n*10)/10;return Number.isInteger(r)?String(r):r.toFixed(1);};
  const dayText=d=>d===0?"今天":d+" 天前";
  function hide(){panel.classList.remove("on","in");document.body.classList.remove("co-open");}
  function render(comp,ages,regions,ageSel){
    if(!comp||!ages||!ages.length){hide();return;}
    const s=ages.slice().sort((a,b)=>a-b),n=s.length;
    const mean=s.reduce((x,y)=>x+y,0)/n,med=quant(s,.5),q1=quant(s,.25),q3=quant(s,.75),lo=s[0],hi=s[n-1];
    elMono.textContent=monogram(comp);
    elName.textContent=comp;elName.title=comp;
    elRegions.innerHTML=Object.keys(REGIONS).filter(k=>regions&&regions[k]).map(k=>'<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+regions[k]+'</span>').join("");
    elCount.textContent=n;
    elMean.innerHTML=num(mean)+'<small>天</small>';
    elMed.innerHTML=num(med)+'<small>天</small>';
    const counts=BUCKETS.map(b=>s.filter(d=>b.hit(d)).length),cmax=Math.max.apply(null,counts.concat(1));
    elHist.innerHTML=BUCKETS.map((b,i)=>{
      const c=counts[i],act=ageSel===b.v;
      return '<button type="button" class="co-bar'+(c?"":" empty")+(act?" active":"")+'" data-age="'+b.v+'" aria-pressed="'+act+'"'+(c?'':' tabindex="-1" aria-disabled="true"')+' title="'+b.label+' · '+c+' 个职位">'
        +'<span class="co-bar-l">'+b.label+'</span>'
        +'<span class="co-bar-t"><span class="co-bar-f" data-w="'+(c/cmax*100)+'"></span></span>'
        +'<span class="co-bar-v tnum">'+c+'</span>'
        +'<span class="co-bar-p tnum">'+(c?Math.round(c/n*100)+"%":"—")+'</span></button>';
    }).join("");
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
    const skew=med>0?mean/med:1;
    const note=n<4?"样本较少，指标仅供参考。":skew>1.2?"分布右偏——少量长期未关闭的职位抬高了平均值，以中位数为准。":skew<.85?"分布左偏——近期集中放出，早期职位已较少。":"分布接近对称——发帖节奏稳定。";
    elFoot.innerHTML='<div class="co-fact"><span class="co-fact-k">最新</span><b>'+dayText(lo)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">最早</span><b>'+dayText(hi)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">四分位</span><b>'+num(q1)+' – '+num(q3)+' 天</b></div>'
      +'<p class="co-note">'+note+'</p>';
    panel.classList.add("on");document.body.classList.add("co-open");
    requestAnimationFrame(()=>{panel.classList.add("in");elHist.querySelectorAll(".co-bar-f").forEach(f=>{f.style.width=f.dataset.w+"%";});});
  }
  elHist.addEventListener("click",e=>{
    const b=e.target.closest(".co-bar");
    if(!b||b.classList.contains("empty"))return;
    ageEl.value=ageEl.value===b.dataset.age?"all":b.dataset.age;
    apply();
  });
  elClose.addEventListener("click",()=>{companyEl.value="all";apply();});
  window.renderCo=render;
})();
