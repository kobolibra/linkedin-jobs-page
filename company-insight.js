/* Company Insight: retained active + expired records under the current filters.
 * Dates describe the site's records; they cannot establish hiring speed or outcomes.
 */
(function(){
  const DAY=864e5;
  const BUCKETS=[
    {v:'0',label:'今天',hit:d=>d===0},
    {v:'1-7',label:'1–7 天',hit:d=>d>=1&&d<=7},
    {v:'8-14',label:'8–14 天',hit:d=>d>=8&&d<=14},
    {v:'15-21',label:'15–21 天',hit:d=>d>=15&&d<=21},
    {v:'22+',label:'22 天+',hit:d=>d>=22}
  ];
  const quant=(a,p)=>{if(!a.length)return null;const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};
  const num=n=>n==null?'—':String(Math.round(n*10)/10);
  const pct=(n,d)=>d?Math.round(n/d*100)+'%':'—';
  const time=value=>typeof value==='string'&&value.trim()?Date.parse(value):NaN;

  function summarize(records,now=Date.now()){
    const result={total:0,active:0,expired:0,ages:[],missingDates:0,regions:{},activeRegions:{},
      recent:0,recentActive:0,recentExpired:0,previous:0,expiredRecent:0,missingExpiryDates:0,
      activeDated:0,activeOld:0,buckets:BUCKETS.map(b=>({...b,total:0,active:0,expired:0})),ageGroups:[]};
    const groups=new Map();
    for(const record of records||[]){
      if(!record)continue;
      const expired=record.status==='expired',status=expired?'expired':'active';
      const region=['CN','HK','SG'].includes(record.region)?record.region:'OTHER';
      result.total++;result[status]++;
      result.regions[region]=(result.regions[region]||0)+1;
      if(!expired)result.activeRegions[region]=(result.activeRegions[region]||0)+1;
      const date=time(record.date),elapsed=now-date;
      const dated=Number.isFinite(elapsed)&&elapsed>=0;
      if(dated){
        const age=Math.floor(elapsed/DAY);
        result.ages.push(age);
        if(elapsed<7*DAY){result.recent++;result[expired?'recentExpired':'recentActive']++;}
        else if(elapsed<14*DAY)result.previous++;
        if(!expired){result.activeDated++;if(age>=30)result.activeOld++;}
        const bucket=result.buckets.find(b=>b.hit(age));bucket.total++;bucket[status]++;
        if(!groups.has(age))groups.set(age,{age,active:0,expired:0});
        groups.get(age)[status]++;
      }else result.missingDates++;
      if(expired){
        const ended=time(record.expiredAt),since=now-ended;
        if(Number.isFinite(since)&&since>=0&&(!dated||ended>=date)){
          if(since<7*DAY)result.expiredRecent++;
        }else result.missingExpiryDates++;
      }
    }
    result.ages.sort((a,b)=>a-b);
    const s=result.ages;
    result.mean=s.length?s.reduce((sum,n)=>sum+n,0)/s.length:null;
    result.median=quant(s,.5);result.q1=quant(s,.25);result.q3=quant(s,.75);
    result.min=s.length?s[0]:null;result.max=s.length?s[s.length-1]:null;
    result.ageGroups=[...groups.values()].sort((a,b)=>a.age-b.age);
    return result;
  }

  function insights(s){
    if(!s.total)return [];
    const notes=[];
    if(!s.active)notes.push('当前范围内 '+s.total+' 个职位均已失效，没有标记有效的职位。');
    if(s.ages.length){
      let recent='近7日职位 '+s.recent+' 个，其中有效 '+s.recentActive+' 个、失效 '+s.recentExpired+' 个；此前7日 '+s.previous+' 个。';
      notes.push(recent);
    }
    if(s.activeDated){
      notes.push('有日期的有效职位中，'+s.activeOld+' / '+s.activeDated+' 个（'+pct(s.activeOld,s.activeDated)+'）记录已达30天；查看较早职位时可核对原招聘链接。');
    }
    if(s.expired){
      notes.push('近7日有 '+s.expiredRecent+' 个职位被标记失效。'+(s.missingExpiryDates?s.missingExpiryDates+' 个失效职位缺少可用的状态日期，未计入此项。':''));
    }
    const ranked=Object.entries(s.activeRegions).sort((a,b)=>b[1]-a[1]);
    if(s.active&&Object.keys(s.regions).length>1&&ranked[0][1]/s.active>=.6){
      notes.push('有效职位集中在 '+ranked[0][0]+'：'+ranked[0][1]+' / '+s.active+' 个（'+pct(ranked[0][1],s.active)+'）。');
    }
    if(s.missingDates)notes.push(s.missingDates+' 个职位缺少可用日期，计入总量和状态统计，未计入日期分析。');
    return notes;
  }
  // Pure calculations are shared with regression tests; no job data is mutated.
  window.CompanyInsight={summarize,insights};
  const panel=document.getElementById('coPanel');
  if(!panel)return;
  const $=id=>document.getElementById(id);
  const elName=$('coName'),elMono=$('coMono'),elRegions=$('coRegions'),elStatus=$('coStatus'),
    elCount=$('coCount'),elFresh=$('coFresh'),elMed=$('coMed'),elMean=$('coMean'),
    elHist=$('coHist'),elAxisSec=$('coAxisSec'),elPlot=$('coPlot'),elScale=$('coScale'),
    elFoot=$('coFoot'),elClose=$('coClose');
  const dayText=d=>d==null?'—':d===0?'今天':d+' 天前';
  function hide(){panel.classList.remove('on','in');document.body.classList.remove('co-open');}
  function render(comp,records,ageSel){
    const s=summarize(records);
    if(!comp||!s.total){hide();return;}
    if(elMono)elMono.textContent=monogram(comp);
    elName.textContent=comp;elName.title=comp;
    elRegions.innerHTML=['CN','HK','SG','OTHER'].filter(k=>s.regions[k]).map(k=>
      '<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+s.regions[k]+'</span>').join('');
    elStatus.innerHTML='<span class="co-status-active">有效 <b>'+s.active+'</b></span><span class="co-status-expired">失效 <b>'+s.expired+'</b></span>';
    elCount.textContent=s.total;
    elFresh.innerHTML=s.ages.length?s.recent+'<small>'+pct(s.recent,s.ages.length)+'</small>':'—';
    elFresh.title='近7日占有可用日期职位的比例；有效 '+s.recentActive+'，失效 '+s.recentExpired;
    elMed.innerHTML=num(s.median)+(s.median==null?'':'<small>天</small>');
    elMean.innerHTML=num(s.mean)+(s.mean==null?'':'<small>天</small>');
    const max=Math.max(1,...s.buckets.map(b=>b.total));
    elHist.innerHTML=s.buckets.map(b=>{
      const selected=ageSel===b.v,share=b.total?b.active/b.total*100:0;
      return '<button type="button" class="co-bar'+(!b.total?' empty':'')+(selected?' active':'')+'" data-age="'+b.v+'" aria-pressed="'+selected+'"'+(!b.total?' disabled':'')
        +' title="'+b.label+' · '+b.total+' 个：有效 '+b.active+'，失效 '+b.expired+'">'
        +'<span class="co-bar-l">'+b.label+'</span><span class="co-bar-t"><span class="co-bar-f co-bar-stack" data-w="'+b.total/max*100+'">'
        +'<span class="co-segment-active" style="width:'+share+'%"></span><span class="co-segment-expired" style="width:'+(100-share)+'%"></span></span></span>'
        +'<span class="co-bar-v tnum">'+b.total+'</span><span class="co-bar-p tnum">'+(b.total?pct(b.total,s.ages.length):'—')+'</span></button>';
    }).join('');
    if(s.ages.length>=3){
      elAxisSec.style.display='';
      const span=Math.max(s.max,1),pos=d=>d/span*100;
      elPlot.innerHTML='<span class="co-band" style="left:'+pos(s.q1)+'%;width:'+(pos(s.q3)-pos(s.q1))+'%"></span>'
        +s.ageGroups.map(g=>'<span class="co-tick" style="left:'+pos(g.age)+'%;width:'+Math.min(4,1+Math.log2(g.active+g.expired))+'px" title="'+g.age+' 天：有效 '+g.active+'，失效 '+g.expired+'"></span>').join('')
        +'<span class="co-mk co-mean" style="left:'+pos(s.mean)+'%"></span><span class="co-mk co-med" style="left:'+pos(s.median)+'%"></span>';
      elScale.innerHTML='<span>0 天</span><span>'+span+' 天</span>';
    }else elAxisSec.style.display='none';
    elFoot.innerHTML='<div class="co-facts">'
      +'<div class="co-fact"><span class="co-fact-k">最近记录</span><b>'+dayText(s.min)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">最早记录</span><b>'+dayText(s.max)+'</b></div>'
      +'<div class="co-fact"><span class="co-fact-k">中间 50%</span><b>'+(s.q1==null?'—':num(s.q1)+' – '+num(s.q3)+' 天')+'</b></div></div>'
      +insights(s).map(note=>'<p class="co-note">'+note+'</p>').join('')
      +'<p class="co-scope">统计当前公司、地区等筛选下保留的全部记录，包含失效职位，不随时间区间筛选缩减。日期采用站内记录，可能含历史回填；失效不代表已招满。</p>';
    panel.classList.add('on');document.body.classList.add('co-open');
    requestAnimationFrame(()=>{panel.classList.add('in');elHist.querySelectorAll('.co-bar-f').forEach(f=>{f.style.width=f.dataset.w+'%';});});
  }
  elHist.addEventListener('click',e=>{
    const b=e.target.closest('.co-bar');
    if(!b||b.classList.contains('empty'))return;
    ageEl.value=ageEl.value===b.dataset.age?'all':b.dataset.age;apply();
  });
  elClose.addEventListener('click',()=>{companyEl.value='all';apply();});
  window.renderCo=render;
})();
