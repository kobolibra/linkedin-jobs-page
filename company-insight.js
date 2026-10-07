/* Separate unfinished exposure from completed, observed listing lifetimes.
 * firstSeen is stable across reposts; expiredAt is an observed status transition.
 * Retained records are not a complete event log: weekly balance is not stock change.
 */
(function(){
  const DAY=864e5;
  const BINS=[{label:'<7 天',min:0,max:7},{label:'7–14 天',min:7,max:14},{label:'14–30 天',min:14,max:30},{label:'30–60 天',min:30,max:60},{label:'≥60 天',min:60,max:Infinity}];
  const time=value=>typeof value==='string'&&value.trim()?Date.parse(value):NaN;
  const quant=(a,p)=>{if(!a.length)return null;const i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);};
  const num=n=>n==null?'—':String(Math.round(n*10)/10);
  const pct=(n,d)=>d?Math.round(n/d*100)+'%':'—';
  const signed=n=>(n>0?'+':'')+n;
  function stats(values){
    const a=[...values].sort((x,y)=>x-y);
    return {n:a.length,values:a,median:quant(a,.5),mean:a.length?a.reduce((s,n)=>s+n,0)/a.length:null,q1:quant(a,.25),q3:quant(a,.75),
      buckets:BINS.map(b=>({...b,count:a.filter(n=>n>=b.min&&n<b.max).length}))};
  }
  function summarize(records,now=Date.now()){
    const s={total:0,active:0,expired:0,regions:{},missingStart:0,missingEnd:0,invalidOrder:0,
      reasons:{confirmed:0,snapshot:0,other:0},weeks:Array.from({length:4},()=>({added:0,closed:0,durations:[]}))};
    const active=[],closed=[];
    for(const r of records||[]){
      if(!r)continue;
      const expired=r.status==='expired',region=['CN','HK','SG'].includes(r.region)?r.region:'OTHER';
      s.total++;s[expired?'expired':'active']++;s.regions[region]=(s.regions[region]||0)+1;
      const start=time(r.date),end=time(r.expiredAt),validStart=Number.isFinite(start)&&start<=now,validEnd=Number.isFinite(end)&&end<=now;
      if(validStart){
        const age=(now-start)/DAY,w=Math.floor(age/7);
        if(w<4)s.weeks[w].added++;
        if(!expired)active.push(age);
      }else s.missingStart++;
      if(!expired)continue;
      s.reasons[/^linkedin_(closed|removed)$/.test(r.expiredReason)?'confirmed':r.expiredReason==='missing_from_full_company_snapshot'?'snapshot':'other']++;
      if(!validEnd){s.missingEnd++;continue;}
      if(validStart&&end<start){s.invalidOrder++;continue;}
      const w=Math.floor((now-end)/DAY/7);
      if(w<4)s.weeks[w].closed++;
      if(validStart){
        const duration=(end-start)/DAY;closed.push(duration);
        if(w<4)s.weeks[w].durations.push(duration);
      }
    }
    s.open=stats(active);s.close=stats(closed);
    s.weeks=s.weeks.map(w=>({...w,balance:w.added-w.closed,close:stats(w.durations)}));
    s.oldActive=active.filter(d=>d>=30).length;
    s.beyondQ3=s.close.n?active.filter(d=>d>s.close.q3).length:0;
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
      notes.push('近14天未记录到新增或失效，近期没有可见的职位流转。');
    }else{
      const flow=a.balance>0?'新增多于失效 '+a.balance+' 个':a.balance<0?'失效多于新增 '+(-a.balance)+' 个':'新增与失效数量相当';
      notes.push('发布节奏：近7天新增 '+a.added+' 个，'+change(a.added,b.added)+'；失效 '+a.closed+' 个，'+change(a.closed,b.closed)+'。'+flow+'。');
    }
    if(a.close.n>=5&&b.close.n>=5){
      const d=a.close.median-b.close.median;
      notes.push('关闭用时：近7天失效的 '+a.close.n+' 个职位，中位 '+num(a.close.median)+' 天；前7天 '+b.close.n+' 个，中位 '+num(b.close.median)+' 天，'+(Math.abs(d)<.05?'基本持平':(d>0?'延长 ':'缩短 ')+num(Math.abs(d))+' 天')+'。');
    }else if(s.close.n){
      notes.push('关闭用时变化：近两周可用样本分别为 '+a.close.n+' / '+b.close.n+' 个，暂不足以比较速度变化。');
    }
    if(s.close.n>=5&&s.close.mean-s.close.median>=2&&s.close.mean>s.close.median*1.25){
      notes.push('长周期职位拉高了平均数：比中位数高 '+num(s.close.mean-s.close.median)+' 天；典型关闭用时更宜参考中位数。');
    }
    if(s.open.n){
      let note='在招存量：'+s.oldActive+' / '+s.open.n+' 个（'+pct(s.oldActive,s.open.n)+'）已挂出至少30天。';
      if(s.close.n>=10)note+=s.beyondQ3+' 个在招职位已超过历史关闭用时的75%分位（'+num(s.close.q3)+' 天）。';
      notes.push(note);
    }
    return notes;
  }
  window.CompanyInsight={summarize,insights};
  const $=id=>document.getElementById(id),panel=$('coPanel');
  if(!panel)return;
  const days=n=>num(n)+(n==null?'':' 天');
  function render(comp,records){
    const s=summarize(records);
    if(!comp||!s.total){panel.classList.remove('on','in');document.body.classList.remove('co-open');return;}
    $('coName').textContent=comp;$('coName').title=comp;
    $('coRegions').innerHTML=['CN','HK','SG','OTHER'].filter(k=>s.regions[k]).map(k=>'<span class="co-chip" data-region="'+k+'"><i></i>'+k+' '+s.regions[k]+'</span>').join('');
    $('coStatus').innerHTML='<span class="co-status-active">在招 <b>'+s.active+'</b></span><span class="co-status-expired">失效 <b>'+s.expired+'</b></span>';
    const row=(label,a,b)=>'<tr><th scope="row">'+label+'</th><td>'+a+'</td><td>'+b+'</td></tr>';
    const range=c=>c.n?num(c.q1)+'–'+num(c.q3)+' 天':'—';
    $('coMetrics').innerHTML='<thead><tr><th scope="col">时长</th><th scope="col" title="当前时间减首次记录日期；尚未关闭，不计入关闭用时">在招已挂出</th><th scope="col" title="标记失效日期减首次记录日期；首次日期可能来自平台发布日期或首次收录，重新发布不重置起点。衡量观测到的职位存续时间，不是完成招聘时间">失效前挂出</th></tr></thead><tbody>'
      +row('中位数',days(s.open.median),days(s.close.median))+row('平均数',days(s.open.mean),days(s.close.mean))
      +row('中间50%',range(s.open),range(s.close))+row('可用样本',s.open.n+' / '+s.active,s.close.n+' / '+s.expired)+'</tbody>';
    $('coHist').innerHTML=BINS.map((bin,i)=>{
      const a=s.open.buckets[i].count,c=s.close.buckets[i].count;
      return '<div class="co-duration-row"><span>'+bin.label+'</span><div class="co-pair">'+[[a,s.open.n,'open','在招'],[c,s.close.n,'closed','失效']].map(([n,total,cls,label])=>'<div class="co-duration-line" title="'+label+'：'+n+' / '+total+' 个，'+pct(n,total)+'；区间含下限、不含上限"><span class="co-track"><i class="'+cls+'" style="width:'+(total?n/total*100:0)+'%"></i></span><span class="tnum">'+n+' <small>'+pct(n,total)+'</small></span></div>').join('')+'</div></div>';
    }).join('');
    $('coRhythm').innerHTML='<thead><tr><th scope="col">时间窗口</th><th scope="col">新增</th><th scope="col">失效</th><th scope="col" title="当前保留记录中的新增数减失效数；不是有效职位库存的实际变化，重开及已清理历史不在事件统计内">差额</th></tr></thead><tbody>'
      +s.weeks.map((w,i)=>'<tr><th scope="row">'+['近7天','前7天','14–21天前','21–28天前'][i]+'</th><td>'+w.added+'</td><td>'+w.closed+'</td><td>'+signed(w.balance)+'</td></tr>').join('')+'</tbody>';
    $('coFoot').innerHTML=insights(s).map(note=>'<p class="co-note">'+note+'</p>').join('');
    const gaps=[];
    if(s.missingStart)gaps.push(s.missingStart+' 条缺有效起始日期');
    if(s.missingEnd)gaps.push(s.missingEnd+' 条缺有效失效日期');
    if(s.invalidOrder)gaps.push(s.invalidOrder+' 条起止日期倒置');
    $('coQuality').textContent=gaps.length?'未纳入对应时长计算：'+gaps.join('；')+'。':'';
    $('coStatus').title='失效来源：LinkedIn关闭/移除 '+s.reasons.confirmed+'；完整抓取中消失 '+s.reasons.snapshot+'；其他或未记录 '+s.reasons.other;
    panel.classList.add('on');document.body.classList.add('co-open');requestAnimationFrame(()=>panel.classList.add('in'));
  }
  $('coClose').addEventListener('click',()=>{companyEl.value='all';apply();});
  window.renderCo=render;
})();
