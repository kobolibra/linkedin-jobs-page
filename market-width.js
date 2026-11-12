/* Market Width — daily first-seen roles, not active stock.
   Quiet editorial radar: one day, one region, one count series.
   Concave DAILY scale keeps low-volume days legible without hiding zeroes.
   It is intentionally not an area-comparison chart between dates. */
(function(root){
'use strict';
const FIRMS=Object.freeze([
 'HSBC','Standard Chartered','Citi','JPMorgan Chase','BNP Paribas',
 'Societe Generale','DBS Bank','Deutsche Bank','Goldman Sachs','BlackRock',
 'Bank of America','Fidelity International','Morgan Stanley','BBVA',
 'Natixis','UBS','Schroders','Invesco'
]);
const SHORT=Object.freeze([
 'HSBC','Standard C.','Citi','JPMorgan','BNP Paribas','SocGen',
 'DBS','Deutsche','Goldman','BlackRock','BofA','Fidelity',
 'Morgan St.','BBVA','Natixis','UBS','Schroders','Invesco'
]);
const ALIASES={
 'HSBC':['the hongkong and shanghai banking corporation'],
 'Standard Chartered':['standard chartered bank','渣打环球商业服务有限公司'],
 'Citi':['citibank','citigroup'],
 'JPMorgan Chase':['jpmorgan','jpmorganchase','jp morgan chase'],
 'BNP Paribas':['bnp'],
 'Societe Generale':['société générale'],
 'DBS Bank':['dbs'],
 'BlackRock':['black rock','blackrock asset management'],
 'Bank of America':['bank of america corporation','bofa','bofa securities','bank of america merrill lynch'],
 'Fidelity International':['fil investment management','fidelity investment managers'],
 'UBS':['ubs group'],
 'Schroders':['schroder investment management','schroders investment management'],
 'Invesco':['invesco ltd']
};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g,' ').trim();
const names=new Map();
FIRMS.forEach((name,i)=>[name,...(ALIASES[name]||[])].forEach(key=>names.set(norm(key),i)));
const firmIndex=name=>names.get(norm(name))??-1;
const REGIONS=['all','CN','HK','SG'];
const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const firstSeenKey=j=>{
 const d=new Date(j.firstSeen||j.pushTime||'');
 return Number.isFinite(d.getTime())?dateKey(d):'';
};
function aggregate(rows,days,keyOf=firstSeenKey){
 const keys=days.map(d=>typeof d==='string'?d:d.key||dateKey(d.date));
 const empty=()=>keys.map(()=>Array(FIRMS.length).fill(0));
 const counts={all:empty(),CN:empty(),HK:empty(),SG:empty()};
 const slots=new Map(keys.map((key,i)=>[key,i]));
 for(const job of rows||[]){
  if(!job||job.jobStatus==='expired')continue;
  const firm=firmIndex(job.company),region=String(job.location||'').toUpperCase(),slot=slots.get(keyOf(job));
  if(firm<0||slot===undefined||!REGIONS.includes(region))continue;
  counts.all[slot][firm]++;counts[region][slot][firm]++;
 }
 return {keys,counts};
}
function daily(series,region,day){
 const rows=series.counts[region]||series.counts.all,values=rows[day];
 const period=rows.slice(Math.max(0,day-6),day+1);
 const average=FIRMS.map((_,i)=>period.reduce((sum,row)=>sum+row[i],0)/period.length);
 return {values,average,total:values.reduce((sum,n)=>sum+n,0),firms:values.filter(Boolean).length};
}
function limit(n){
 if(n<=1)return 1;
 const p=10**Math.floor(Math.log10(n));
 return [1,2,5,10].map(unit=>unit*p).find(x=>x>=n)||10*p;
}
// A concave count transform improves resolution around 1–5 daily
// records while leaving 0 exactly at the center and preserving count order.
// The radius max is the highest ACTUAL daily count in the selected region/date,
// not a 30-day extreme that can turn every ordinary day into a small dot.
const POWER=.23;
const scaledRadius=(value,max)=>value<=0?0:Math.pow(value/Math.max(1,max),POWER);
const inverseRadius=(fraction,max)=>Math.pow(Math.max(0,fraction),1/POWER)*Math.max(1,max);
const domain=values=>Math.max(1,...values);
const XML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
/* Zero is absence of a glyph. A dot's angle identifies the firm and its
   radius encodes the count; the muted rings are orientation, not data series.
   No polygon is connected through zero and no baseline spoke reaches the origin. */
function radialPoints(values,max){
 const cx=320,cy=218,R=135,angle=i=>Math.PI*(i*2/18-.5);
 return values.map((value,i)=>{
  const a=angle(i),radius=value>0?R*scaledRadius(value,max):0;
  return {firm:i,value,angle:a,x:cx+radius*Math.cos(a),y:cy+radius*Math.sin(a)};
 });
}
function render(rows,days){
 if(typeof document==='undefined'||!Array.isArray(days)||!days.length)return;
 const el=id=>document.getElementById(id);
 const host=el('marketWidth'),slider=el('marketWidthDay'),prev=el('marketWidthPrev'),next=el('marketWidthNext');
 const dateText=el('marketWidthDate'),firmText=el('marketWidthFirms'),countText=el('marketWidthCount');
 const note=el('marketWidthStatus'),detail=el('marketWidthDetails'),scaleText=el('marketWidthScale');
 const tabs=el('marketWidthRegions'),inspection=el('marketWidthInspection');
 if(!host||!slider||!prev||!next||!dateText||!firmText||!countText||!detail||!tabs)return;
 const series=aggregate(rows,days),last=series.keys.length-1;
 let day=series.counts.all.findLastIndex(values=>values.some(Boolean));
 if(day<0)day=last;
 let region='all';
 slider.min='0';slider.max=String(last);slider.step='1';
 const fixed=n=>Number(n).toFixed(2),coord=(angle,r)=>[320+Math.cos(angle)*r,218+Math.sin(angle)*r];
 const rings=[47,91,135].map((r,i)=>'<circle class="mw-ring'+(i===2?' mw-outer':'')+'" cx="320" cy="218" r="'+r+'"/>').join('');
 const ticks=FIRMS.map((_,i)=>{
  const a=Math.PI*(i*2/18-.5),[x1,y1]=coord(a,139),[x2,y2]=coord(a,145);
  return '<line class="mw-tick-mark" x1="'+fixed(x1)+'" y1="'+fixed(y1)+'" x2="'+fixed(x2)+'" y2="'+fixed(y2)+'"/>';
 }).join('');
 function draw(){
  const snapshot=daily(series,region,day),values=snapshot.values,key=series.keys[day],max=domain(values);
  const points=radialPoints(values,max),active=points.filter(p=>p.value>0);
  // The label rail is outside the orbit. No leader lines are drawn for zeros.
  const labels=points.map(p=>{
   const [x,y]=coord(p.angle,174),c=Math.cos(p.angle);
   const anchor=Math.abs(c)<.12?'middle':c>0?'start':'end';
   const xx=x+(anchor==='start'?7:anchor==='end'?-7:0);
   return '<text class="mw-firm'+(p.value?' mw-active-label':'')+'" x="'+fixed(xx)+'" y="'+fixed(y+3)+'" text-anchor="'+anchor+'" data-firm-label="'+p.firm+'"><title>'+XML(FIRMS[p.firm])+' · '+p.value+' new postings</title>'+XML(SHORT[p.firm])+'</text>';
  }).join('');
  // Do not join disconnected points. No shaded/filled radar polygon exists.
  const glyphs=active.map(p=>{
   const title=XML(FIRMS[p.firm]+' · '+p.value+' newly observed roles · '+key+' · '+(region==='all'?'all regions':region));
   return '<g class="mw-point" tabindex="0" role="img" data-firm="'+p.firm+'" aria-label="'+title+'">'+
    '<circle class="mw-hit" cx="'+fixed(p.x)+'" cy="'+fixed(p.y)+'" r="12"/>'+
    '<circle class="mw-dot" cx="'+fixed(p.x)+'" cy="'+fixed(p.y)+'" r="4.5"/>'+
    '<title>'+title+'</title></g>';
  }).join('');
  const empty=snapshot.total===0?'<g class="mw-empty-state"><text x="320" y="214" text-anchor="middle">No new roles</text><text x="320" y="232" text-anchor="middle" class="mw-empty-sub">recorded for this date</text></g>':'';
  const a11y='Market Width · '+key+' · '+(region==='all'?'all regions':region)+' · '+snapshot.total+' new postings from '+snapshot.firms+' of 18 selected firms. Dots represent positive counts; zero has no dot. The radius is nonlinear and recalibrated for each day and region.';
  host.innerHTML='<svg class="mw-svg" viewBox="0 0 640 440" role="img" aria-label="'+XML(a11y)+'"><title>Market Width · New roles by institution</title><desc>Minimal radial dot plot on three faint reference rings. Eighteen company labels. Each visible dot is a positive count; no lines connect dots to zero. Inspect the table for exact daily figures. Radius uses a nonlinear, date-specific scale.</desc><g class="mw-guide" aria-hidden="true">'+rings+ticks+'</g>'+glyphs+labels+empty+'</svg>';
  dateText.textContent=key;countText.textContent=fmt(snapshot.total);firmText.textContent=snapshot.firms+' / 18';
  slider.value=String(day);prev.disabled=day===0;next.disabled=day===last;
  if(scaleText)scaleText.textContent='Detail scale · 0–'+fmt(max)+' roles per firm';
  if(note)note.textContent=a11y;
  const rank=[...active].sort((a,b)=>b.value-a.value||a.firm-b.firm);
  const overview=rank.length?rank.slice(0,2).map(p=>FIRMS[p.firm]+' '+p.value).join('  ·  '):'No newly observed roles on this date';
  if(inspection)inspection.textContent=overview;
  detail.replaceChildren(...FIRMS.map((name,i)=>{
   const tr=document.createElement('tr');
   for(const value of [name,String(values[i])]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   return tr;
  }));
  tabs.querySelectorAll('[data-market-region]').forEach(btn=>{
   const chosen=btn.dataset.marketRegion===region;
   btn.classList.toggle('active',chosen);btn.setAttribute('aria-selected',String(chosen));btn.tabIndex=chosen?0:-1;
  });
  const svg=host.querySelector('.mw-svg');
  for(const g of host.querySelectorAll('.mw-point')){
   const label=host.querySelector('[data-firm-label="'+g.dataset.firm+'"]');
   const show=()=>{g.classList.add('is-focused');label?.classList.add('is-focused');if(inspection)inspection.textContent=FIRMS[Number(g.dataset.firm)]+'  ·  '+values[Number(g.dataset.firm)]+' new roles';};
   const hide=()=>{g.classList.remove('is-focused');label?.classList.remove('is-focused');if(inspection)inspection.textContent=overview;};
   g.addEventListener('pointerenter',show);g.addEventListener('pointerleave',hide);
   g.addEventListener('focus',show);g.addEventListener('blur',hide);
  }
 }
 slider.addEventListener('input',()=>{day=Number(slider.value);draw();});
 prev.addEventListener('click',()=>{day=Math.max(0,day-1);draw();});
 next.addEventListener('click',()=>{day=Math.min(last,day+1);draw();});
 tabs.addEventListener('click',e=>{const btn=e.target.closest('[data-market-region]');if(!btn)return;region=btn.dataset.marketRegion;draw();});
 tabs.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
  const pos=REGIONS.indexOf(region);
  region=REGIONS[e.key==='Home'?0:e.key==='End'?3:(pos+(e.key==='ArrowRight'?1:3))%4];
  draw();tabs.querySelector('[data-market-region="'+region+'"]')?.focus();e.preventDefault();
 });
 draw();
}

const api={FIRMS,REGIONS,firmIndex,aggregate,daily,limit,POWER,domain,scaledRadius,inverseRadius,radialPoints,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
