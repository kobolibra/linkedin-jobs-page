/* Market Width: daily NEW first-seen roles for 18 tracked firms.
   Use the existing deduplicated current-active chart rows, not total inventory
   or pushTime/reposting counts. Works for full and anonymous preview data. */
(function(root){
'use strict';
const FIRMS=Object.freeze([
 'HSBC','Standard Chartered','Citi','JPMorgan Chase','BNP Paribas',
 'Societe Generale','DBS Bank','Deutsche Bank','Goldman Sachs','BlackRock',
 'Bank of America','Fidelity International','Morgan Stanley','BBVA',
 'Natixis','UBS','Schroders','Invesco'
]);
const SHORT=Object.freeze([
 'HSBC','StanChart','Citi','JPMorgan','BNP Paribas','SocGen','DBS','Deutsche',
 'Goldman','BlackRock','BofA','Fidelity','Morgan St.','BBVA','Natixis',
 'UBS','Schroders','Invesco'
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
 const date=new Date(j.firstSeen||j.pushTime||'');
 return Number.isFinite(date.getTime())?dateKey(date):'';
};
const regionOf=j=>String(j.location||'').toUpperCase();
function aggregate(rows,days,keyOf=firstSeenKey){
 const keys=days.map(d=>typeof d==='string'?d:d.key||dateKey(d.date));
 const empty=()=>keys.map(()=>Array(FIRMS.length).fill(0));
 const counts={all:empty(),CN:empty(),HK:empty(),SG:empty()};
 const slots=new Map(keys.map((key,i)=>[key,i]));
 for(const job of rows||[]){
  // Consistent with New Postings' first-seen-on-day among currently active roles.
  if(!job||job.jobStatus==='expired')continue;
  const firm=firmIndex(job.company),region=regionOf(job),slot=slots.get(keyOf(job));
  if(firm<0||slot===undefined||!REGIONS.includes(region))continue;
  counts.all[slot][firm]++;
  counts[region][slot][firm]++;
 }
 return {keys,counts};
}
function daily(series,region,day){
 const rows=series.counts[region]||series.counts.all;
 const values=rows[day];
 const start=Math.max(0,day-6),period=rows.slice(start,day+1);
 const average=FIRMS.map((_,i)=>period.reduce((sum,row)=>sum+row[i],0)/period.length);
 return {values,average,total:values.reduce((s,n)=>s+n,0),firms:values.filter(Boolean).length};
}
function limit(n){
 if(n<=1)return 1;
 const p=10**Math.floor(Math.log10(n));
 return [1,2,5,10].map(x=>x*p).find(x=>x>=n)||10*p;
}
function render(rows,days){
 if(typeof document==='undefined'||!days?.length)return;
 const el=id=>document.getElementById(id),host=el('marketWidth'),slider=el('marketWidthDay');
 const prev=el('marketWidthPrev'),next=el('marketWidthNext');
 const dayText=el('marketWidthDate'),active=el('marketWidthFirms'),count=el('marketWidthCount');
 const note=el('marketWidthStatus'),details=el('marketWidthDetails'),scaleText=el('marketWidthScale');
 const tabs=el('marketWidthRegions');
 if(!host||!slider||!prev||!next||!dayText||!active||!count||!details||!tabs)return;
 const series=aggregate(rows,days);
 // Fixed global scale, across all days and ALL/CN/HK/SG selections.
 const max=limit(Math.max(1,...series.counts.all.flat()));
 let region='all',day=series.keys.length-1;
 // Latest day with at least one observed posting is a more informative default,
 // but the date itself remains explicit and cannot be mistaken for 'today'.
 const latest=series.counts.all.findLastIndex(row=>row.some(Boolean));
 if(latest>=0)day=latest;
 slider.min='0';slider.max=String(series.keys.length-1);slider.step='1';
 const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cx=320,cy=227,r=135,lr=174;
 const ang=i=>i*2*Math.PI/18-Math.PI/2;
 const coord=(i,rad)=>[cx+Math.cos(ang(i))*rad,cy+Math.sin(ang(i))*rad];
 const points=values=>values.map((value,i)=>coord(i,r*value/max).map(x=>x.toFixed(2)).join(',')).join(' ');
 const rings=[.25,.5,.75,1].map(t=>'<polygon class="mw-ring" points="'+FIRMS.map((_,i)=>coord(i,r*t).map(x=>x.toFixed(2)).join(',')).join(' ')+'"/>').join('');
 const spokes=FIRMS.map((_,i)=>{const [x,y]=coord(i,r);return '<line class="mw-spoke" x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(2)+'" y2="'+y.toFixed(2)+'"/>';}).join('');
 const labels=FIRMS.map((name,i)=>{
  const [x,y]=coord(i,lr),cos=Math.cos(ang(i)),anchor=Math.abs(cos)<.12?'middle':cos>0?'start':'end';
  return '<text class="mw-firm" x="'+(x+(anchor==='start'?7:anchor==='end'?-7:0)).toFixed(2)+'" y="'+(y+3).toFixed(2)+'" text-anchor="'+anchor+'"><title>'+esc(name)+'</title>'+esc(SHORT[i])+'</text>';
 }).join('');
 function paint(){
  const snapshot=daily(series,region,day),key=series.keys[day],values=snapshot.values;
  const comparison='<polygon class="mw-reference" points="'+points(snapshot.average)+'"/>';
  const polygon=snapshot.total?'<polygon class="mw-area" points="'+points(values)+'"/>':'';
  const dots=values.map((n,i)=>{
   if(!n)return '';
   const [x,y]=coord(i,r*n/max);
   const hint=esc(FIRMS[i]+' · '+key+' · '+n+' new roles; 7-day daily average '+fmt(snapshot.average[i]));
   return '<g class="mw-point" tabindex="0" role="img" aria-label="'+hint+'"><circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="3.5"/><title>'+hint+'</title></g>';
  }).join('');
  const caption=esc(key+' · '+(region==='all'?'All regions':region)+' · '+snapshot.total+' new first-seen, still-active roles across '+snapshot.firms+' tracked firms');
  host.innerHTML='<svg class="mw-svg" viewBox="0 0 640 456" role="img" aria-label="'+caption+'"><title>Market Width — daily new postings</title><desc>Each of 18 spokes is a tracked firm. Filled polygon is the chosen date, dotted polygon is trailing 7-day average. The radial scale remains fixed across regions and dates; consult the accessible detail table for exact values.</desc><g aria-hidden="true">'+rings+spokes+'</g>'+comparison+polygon+dots+labels+'</svg>';
  slider.value=String(day);prev.disabled=day===0;next.disabled=day===series.keys.length-1;
  dayText.textContent=(days[day]?.label||key)+' · '+key;
  active.textContent=snapshot.firms+' / 18';count.textContent=fmt(snapshot.total);
  if(scaleText)scaleText.textContent='0–'+fmt(max)+' ROLES / FIRM';
  if(note)note.textContent='Daily first seen · currently active · '+(region==='all'?'all regions':region)+' · '+key;
  details.replaceChildren(...FIRMS.map((name,i)=>{
   const tr=document.createElement('tr');
   for(const value of [name,String(values[i]),fmt(snapshot.average[i])]){
    const td=document.createElement('td');td.textContent=value;tr.appendChild(td);
   }
   return tr;
  }));
  for(const btn of tabs.querySelectorAll('[data-market-region]')){
   const selected=btn.dataset.marketRegion===region;
   btn.classList.toggle('active',selected);btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;
  }
 }
 slider.addEventListener('input',()=>{day=Number(slider.value);paint();});
 prev.addEventListener('click',()=>{day=Math.max(0,day-1);paint();});
 next.addEventListener('click',()=>{day=Math.min(series.keys.length-1,day+1);paint();});
 tabs.addEventListener('click',event=>{const btn=event.target.closest('[data-market-region]');if(!btn)return;region=btn.dataset.marketRegion;paint();});
 tabs.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const position=REGIONS.indexOf(region),index=event.key==='Home'?0:event.key==='End'?3:(position+(event.key==='ArrowRight'?1:3))%4;
  region=REGIONS[index];paint();tabs.querySelector('[data-market-region="'+region+'"]')?.focus();event.preventDefault();
 });
 paint();
}
const api={FIRMS,REGIONS,firmIndex,aggregate,daily,limit,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
