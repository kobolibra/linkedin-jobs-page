/* Separate unfinished exposure from completed, observed listing lifetimes.
 * firstSeen is stable across reposts; expiredAt is an observed status transition.
 * Retained records are not a complete event log: weekly balance is not stock change.
 */
(function(){
  const DAY=864e5;
  const BINS=[
    {v:'0',label:'今天',min:0,max:1,tier:'fresh'},
    {v:'1-7',label:'1–7 天',min:1,max:8,tier:'fresh'},
    {v:'8-14',label:'8–14 天',min:8,max:15,tier:'mid'},
    {v:'15-21',label:'15–21 天',min:15,max:22,tier:'stale'},
    {v:'22+',label:'22 天+',min:22,max:Infinity,tier:'stale'}
  ];
  const time=value=>typeof value==='string'&&value.trim()?Date.parse(value):NaN;
  const quant=(a,p)=>{if(!a.length)return null;const i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);};
  const num=n=>n==null?'—':String(Math.round(n*10)/10);
  const pct=(n,d)=>d?Math.round(n/d*100)+'%':'—';
  const signed=n=>(n>0?'+':'')+n;
  function stats(values){
    const a=[...values].sort((x,y)=>x-y);
    return {n:a.length,values:a,median:quant(a,.5),mean:a.length?a.reduce((s,n)=>s+n,0)/a.length:null,q1:quant(a,.25),q3:quant(a,.75)};
  }
  function summarize(records,now=Date.now()){
    const s={total:0,active:0,expired:0,regions:{},missingStart:0,missingEnd:0,invalidOrder:0,
      reasons:{confirmed:0,snapshot:0,other:0},weeks:Array.from({length:4},()=>({added:0,closed:0,durations:[]}))};
    // Every listing-age/lifetime metric begins on immutable firstSeen.
    // Only the separate weekly publishing-flow counts use latest posting evidence.
    const active=[],activeLifetimes=[],closed=[];
    for(const r of records||[]){
      if(!r)continue;
      const expired=r.status==='expired',region=['CN','HK','SG'].includes(r.region)?r.region:'OTHER';
      s.total++;s[expired?'expired':'active']++;s.regions[region]=(s.regions[region]||0)+1;
      const cal=window.JobDates;
      const today=cal.dayStart(cal.key(now));
      const start=cal.dayStart(cal.key(r.date));
      const end=cal.dayStart(cal.key(r.expiredAt));
      const validStart=Number.isFinite(start)&&start<=today,validEnd=Number.isFinite(end)&&end<=today;
      const age=validStart?(today-start)/DAY:NaN;
      // The weekly publishing flow is an event count, NOT a listing-age metric.
      const posted=cal.dayStart(cal.key(r.postingDate||r.date));
      const postingAge=Number.isFinite(posted)?(today-posted)/DAY:NaN;
      if(Number.isFinite(postingAge)&&postingAge>=0){
        const w=Math.floor(postingAge/7);
        if(w<4)s.weeks[w].added++;
      }
      if(!expired&&Number.isFinite(age))active.push(age);
      if(!validStart)s.missingStart++;
      if(!expired){
        if(validStart)activeLifetimes.push(age);
        continue;
      }
      s.reasons[/^linkedin_(closed|removed)$/.test(r.expiredReason)?'confirmed':r.expiredReason==='missing_from_full_company_snapshot'?'snapshot':'other']++;
      if(!validEnd){s.missingEnd++;continue;}
      if(validStart&&end<start){s.invalidOrder++;continue;}
      // Compare published and closed events using identical local-day windows.
      const closeAge=(today-end)/DAY;
      const w=Math.floor(closeAge/7);
      if(w<4)s.weeks[w].closed++;
      if(validStart){
        const duration=(end-start)/DAY;closed.push(duration);
        if(w<4)s.weeks[w].durations.push(duration);
      }
    }
    s.open=stats(active);s.close=stats(closed);
    s.open.buckets=BINS.map(b=>({...b,count:active.filter(n=>n>=b.min&&n<b.max).length}));
    s.weeks=s.weeks.map(w=>({...w,balance:w.added-w.closed,close:stats(w.durations)}));
    s.oldActive=active.filter(d=>d>=30).length;
    s.beyondQ3=s.close.n?activeLifetimes.filter(d=>d>s.close.q3).length:0;
    return s;
  }
  function change(current,previous){
    const d=current-previous;
    if(!d)return '与前7天持平';
    return '比前7天'+(d>0?'增加 ':'减少 ')+Math.abs(d)+' 个'+(previous>=5?'（'+signed(Math.round(d/previous*100))+'%）':'');
  }
  function insights(s){
    if(!s.total)return [];
    const notes=[],a=s.weeks[0],b=s.weeks[1];
    if(!s.active)notes.push('当前没有有效职位。');
    if(!s.missingStart&&!s.missingEnd&&!s.invalidOrder&&a.added+a.closed+b.added+b.closed===0){
      notes.push('近14天未记录到新增或关闭，近期没有可见的职位流转。');
    }else{
      const flow=a.balance>0?'新增多于关闭 '+a.balance+' 个':a.balance<0?'关闭多于新增 '+(-a.balance)+' 个':'新增与关闭数量相当';
      notes.push('发布节奏：近7天发布或重发 '+a.added+' 个，'+change(a.added,b.added)+'；关闭 '+a.closed+' 个，'+change(a.closed,b.closed)+'。'+flow+'。');
    }
    if(a.close.n>=5&&b.close.n>=5){
      const d=a.close.median-b.close.median;
      notes.push('关闭用时：近7天关闭的 '+a.close.n+' 个职位，中位 '+num(a.close.median)+' 天；前7天 '+b.close.n+' 个，中位 '+num(b.close.median)+' 天，'+(Math.abs(d)<.05?'基本持平':(d>0?'延长 ':'缩短 ')+num(Math.abs(d))+' 天')+'。');
    }else if(s.close.n){
      notes.push('关闭用时变化：近两周可用样本分别为 '+a.close.n+' / '+b.close.n+' 个，暂不足以比较速度变化。');
    }
    if(s.close.n>=5&&s.close.mean-s.close.median>=2&&s.close.mean>s.close.median*1.25){
      notes.push('长周期职位拉高了平均数：比中位数高 '+num(s.close.mean-s.close.median)+' 天；典型关闭用时更宜参考中位数。');
    }
    if(s.open.n){
      let note='有效存量：'+s.oldActive+' / '+s.open.n+' 个（'+pct(s.oldActive,s.open.n)+'）距最近发布至少30天。';
      if(s.close.n>=10)note+=s.beyondQ3+' 个有效职位已超过历史关闭用时的75%分位（'+num(s.close.q3)+' 天）。';
      notes.push(note);
    }
    return notes;
  }
  window.CompanyInsight={summarize,insights};
  const $=id=>document.getElementById(id),panel=$('coPanel');
  if(!panel)return;
  const days=n=>num(n)+(n==null?'':' 天');
  function render(comp,records,ageSel){
    const s=summarize(records);
    if(!comp||!s.total){panel.classList.remove('on','in');document.body.classList.remove('co-open');return;}
    $('coName').textContent=comp;$('coName').title=comp;
    $('coRegions').innerHTML=['CN','HK','SG','OTHER'].filter(k=>s.regions[k]).map(k=>'<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+s.regions[k]+'</span>').join('');
    $('coStatus').innerHTML='<span class="co-status-active">有效 <b>'+s.active+'</b></span><span class="co-status-expired">关闭 <b>'+s.expired+'</b></span>';
    $('coCount').textContent=s.active;
    $('coFresh').textContent=s.weeks[0].added;
    $('coMed').innerHTML=num(s.open.median)+(s.open.n?'<small>天</small>':'');
    $('coMean').innerHTML=num(s.open.mean)+(s.open.n?'<small>天</small>':'');
    $('coHistSec').hidden=!s.open.n;
    const max=Math.max(1,...s.open.buckets.map(b=>b.count));
    $('coHist').innerHTML=s.open.buckets.map(b=>{
      const selected=ageSel===b.v;
      return '<button type="button" class="co-bar '+b.tier+(!b.count?' empty':'')+(selected?' active':'')+'" data-age="'+b.v+'" aria-pressed="'+selected+'"'+(!b.count?' disabled':'')+' title="有效 '+b.count+' 个；按此发布时间筛选职位列表">'
        +'<span class="co-bar-l">'+b.label+'</span><span class="co-bar-t"><span class="co-bar-f" data-w="'+b.count/max*100+'"></span></span>'
        +'<span class="co-bar-v tnum">'+b.count+'</span><span class="co-bar-p tnum">'+pct(b.count,s.open.n)+'</span></button>';
    }).join('');
    $('coAxisSec').hidden=s.open.n<3;
    if(s.open.n>=3){
      const span=Math.max(s.open.values[s.open.n-1],1),pos=d=>d/span*100,groups=new Map();
      for(const d of s.open.values){const age=d;groups.set(age,(groups.get(age)||0)+1);}
      $('coPlot').innerHTML='<span class="co-band" style="left:'+pos(s.open.q1)+'%;width:'+(pos(s.open.q3)-pos(s.open.q1))+'%"></span>'
        +[...groups].map(([age,n])=>'<span class="co-tick" style="left:'+pos(age)+'%;width:'+Math.min(4,1+Math.log2(n))+'px" title="距最近发布 '+age+' 天：'+n+' 个有效职位"></span>').join('')
        +'<span class="co-mk co-mean" style="left:'+pos(s.open.mean)+'%"></span><span class="co-mk co-med" style="left:'+pos(s.open.median)+'%"></span>';
      $('coScale').innerHTML='<span>0 天</span><span>'+num(span)+' 天</span>';
    }
    $('coOpenRange').textContent=s.open.n?'中间50%：'+num(s.open.q1)+'–'+num(s.open.q3)+' 天':'';
    $('coCloseSec').hidden=!s.expired;
    $('coCloseSample').textContent=s.close.n+' / '+s.expired+' 个';
    $('coCloseMed').textContent=days(s.close.median);
    $('coCloseMean').textContent=days(s.close.mean);
    $('coCloseRange').textContent=s.close.n?'中间50%：'+num(s.close.q1)+'–'+num(s.close.q3)+' 天':'';
    $('coRhythm').innerHTML='<thead><tr><th scope="col">时间窗口</th><th scope="col">发布</th><th scope="col">关闭</th><th scope="col" title="当前保留记录中的新增数减关闭数；不是有效职位库存的实际变化，重开及已清理历史不在事件统计内">差额</th></tr></thead><tbody>'
      +s.weeks.map((w,i)=>'<tr><th scope="row">'+['近7天','前7天','14–21天前','21–28天前'][i]+'</th><td>'+w.added+'</td><td>'+w.closed+'</td><td>'+signed(w.balance)+'</td></tr>').join('')+'</tbody>';
    $('coFoot').innerHTML=insights(s).map(note=>'<p class="co-note">'+note+'</p>').join('');
    const gaps=[];
    if(s.missingStart)gaps.push(s.missingStart+' 条缺可用起始日期');
    if(s.missingEnd)gaps.push(s.missingEnd+' 条缺可用关闭日期');
    if(s.invalidOrder)gaps.push(s.invalidOrder+' 条起止日期倒置');
    $('coQuality').textContent=gaps.length?'未纳入对应时长计算：'+gaps.join('；')+'。':'';
    $('coStatus').title='关闭依据：LinkedIn关闭/移除 '+s.reasons.confirmed+'；完整抓取中消失 '+s.reasons.snapshot+'；其他或未记录 '+s.reasons.other;
    panel.classList.add('on');document.body.classList.add('co-open');
    requestAnimationFrame(()=>{panel.classList.add('in');$('coHist').querySelectorAll('.co-bar-f').forEach(f=>{f.style.width=f.dataset.w+'%';});});
  }
  $('coHist').addEventListener('click',e=>{
    const b=e.target.closest('.co-bar');
    if(!b||b.disabled||b.classList.contains('empty'))return;
    ageEl.value=ageEl.value===b.dataset.age?'all':b.dataset.age;apply();
  });
  $('coClose').addEventListener('click',()=>{companyEl.value='all';apply();});
  window.renderCo=render;
})();
