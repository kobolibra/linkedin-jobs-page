/* Market Width: a 30-day institution-by-day matrix, not a radar.
   Every cell is one company's first-seen, currently active role count on one
   date. Bins have stable absolute thresholds across dates and regions. */
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

// Absolute, persistent legend bands. Do not autoscale by day/region: each
// color has one interpretation throughout the full 30-day comparison.
const LEVELS=Object.freeze([
 {label:"0",min:0,max:0},
 {label:"1",min:1,max:1},
 {label:"2–3",min:2,max:3},
 {label:"4–7",min:4,max:7},
 {label:"8–15",min:8,max:15},
 {label:"16+",min:16,max:Infinity}
]);
const bandOf=n=>n<=0?0:n===1?1:n<=3?2:n<=7?3:n<=15?4:5;
const rowTotals=(counts)=>FIRMS.map((_,i)=>counts.reduce((sum,row)=>sum+(row[i]||0),0));
const sortedFirms=(counts)=>rowTotals(counts).map((total,i)=>({i,total}))
 .sort((a,b)=>b.total-a.total||a.i-b.i);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
const prettyDate=key=>{
 const match=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)return String(key||'');
 return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12).toLocaleDateString('en-US',{month:'short',day:'numeric'});
};
function render(rows,days){
 if(typeof document==='undefined'||!Array.isArray(days)||!days.length)return;
 const el=id=>document.getElementById(id);
 const host=el('marketWidth'),scroll=el('marketWidthScroll'),prev=el('marketWidthPrev'),next=el('marketWidthNext');
 const dateText=el('marketWidthDate'),firmText=el('marketWidthFirms'),countText=el('marketWidthCount');
 const note=el('marketWidthStatus'),inspection=el('marketWidthInspection'),detail=el('marketWidthDetails');
 const tabs=el('marketWidthRegions');
 if(!host||!scroll||!prev||!next||!dateText||!firmText||!countText||!detail||!tabs)return;
 const series=aggregate(rows,days);
 const last=series.keys.length-1;
 let day=series.counts.all.findLastIndex(row=>row.some(Boolean));
 if(day<0)day=last;
 let region='all';
 let overview='';
 const displayCompany=i=>SHORT[i];
 const tooltip=(i,j,n)=>FIRMS[i]+' · '+series.keys[j]+' · '+n+' newly observed, still-active '+(n===1?'role':'roles');
 const gridCell=(i,j,n,selected,firstFocusable)=>{
  const band=bandOf(n);
  return '<button type="button" role="gridcell" aria-colindex="'+(j+2)+'"'+
   ' aria-selected="'+String(selected)+'" aria-label="'+escapeHTML(tooltip(i,j,n))+'"'+
   ' title="'+escapeHTML(tooltip(i,j,n))+'" data-firm="'+i+'" data-day="'+j+'"'+
   ' tabindex="'+(firstFocusable?'0':'-1')+'" class="mw-cell mw-level-'+band+(selected?' is-selected':'')+'"'+
   ' data-level="'+band+'"></button>';
 };
 function updateInspection(text){if(inspection)inspection.textContent=text;}
 function showSelected(){
  const snapshot=daily(series,region,day),key=series.keys[day];
  countText.textContent=fmt(snapshot.total);
  firmText.textContent=snapshot.firms+' / 18';
  dateText.textContent=prettyDate(key);
  dateText.setAttribute('aria-label',key);
  prev.disabled=day===0;next.disabled=day===last;
  overview=prettyDate(key)+' · '+snapshot.total+' new '+(snapshot.total===1?'role':'roles')+' across '+snapshot.firms+' institutions';
  updateInspection(overview);
  if(note)note.textContent=key+', '+(region==='all'?'all regions':region)+': '+snapshot.total+' new roles observed among '+snapshot.firms+' tracked institutions, currently active at latest check.';
  detail.replaceChildren(...sortedFirms(series.counts[region]).map(({i,total})=>{
   const tr=document.createElement('tr');
   for(const val of [FIRMS[i],String(snapshot.values[i]),String(total)]){
    const td=document.createElement('td');td.textContent=val;tr.appendChild(td);
   }
   return tr;
  }));
 }
 function paint(focusFirm=null,scrollToSelected=false){
  const position=scroll.scrollLeft;
  const regionCounts=series.counts[region],rank=sortedFirms(regionCounts);
  const headerDays=series.keys.map((key,j)=>{
   const show=j===0||j===last||(j%7===0&&j<=last-5);
   return '<span role="columnheader" class="mw-day-head'+(j===day?' is-selected':'')+'"'+
    ' aria-label="'+escapeHTML(key)+'" title="'+escapeHTML(key)+'">'+
    (show?'<span class="mw-axis-tick">'+escapeHTML(prettyDate(key))+'</span>':'')+'</span>';
  }).join('');
  const head='<div class="mw-matrix-row mw-header" role="row"><span role="columnheader" class="mw-head-firm">Institution</span>'+
   headerDays+'<span role="columnheader" class="mw-head-total" title="New first-seen roles in the rolling 30 days">30d</span></div>';
  const lines=rank.map(({i,total},rankIndex)=>{
   const label='<span class="mw-company" role="rowheader" aria-label="'+escapeHTML(FIRMS[i])+'" title="'+escapeHTML(FIRMS[i])+'">'+
    '<span class="mw-rank">'+String(rankIndex+1).padStart(2,'0')+'</span><span class="mw-company-name">'+escapeHTML(displayCompany(i))+'</span></span>';
   const cells=series.keys.map((_,j)=>gridCell(i,j,regionCounts[j][i],j===day,rankIndex===0&&j===day)).join('');
   return '<div class="mw-matrix-row mw-company-row" role="row" data-firm-row="'+i+'" aria-rowindex="'+(rankIndex+2)+'">'+
    label+cells+'<span class="mw-row-total" role="gridcell" aria-label="'+escapeHTML(FIRMS[i])+' 30 day total: '+total+'">'+fmt(total)+'</span></div>';
  }).join('');
  host.style.setProperty('--mw-days',String(series.keys.length));
  host.setAttribute('aria-rowcount',String(rank.length+1));
  host.setAttribute('aria-colcount',String(series.keys.length+2));
  host.innerHTML=head+lines;
  for(const tab of tabs.querySelectorAll('[data-market-region]')){
   const active=tab.dataset.marketRegion===region;
   tab.classList.toggle('active',active);
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
  }
  updateInspection('');
  updateSelectedNoRedraw();
  scroll.scrollLeft=position;
  if(scrollToSelected)ensureVisible();
  if(focusFirm!==null){
   const cell=host.querySelector('.mw-cell[data-firm="'+focusFirm+'"][data-day="'+day+'"]');
   cell?.focus({preventScroll:true});
  }
 }
 function updateSelectedNoRedraw(){showSelected();}
 function ensureVisible(){
  const cell=host.querySelector('.mw-cell.is-selected');
  if(!cell||scroll.scrollWidth<=scroll.clientWidth)return;
  const cellBox=cell.getBoundingClientRect(),area=scroll.getBoundingClientRect();
  // The labels are sticky on small screens; keep a small clear margin.
  const leftMargin=scroll.clientWidth<480?116:14;
  if(cellBox.right>area.right-8)scroll.scrollLeft+=cellBox.right-area.right+14;
  else if(cellBox.left<area.left+leftMargin)scroll.scrollLeft-=area.left+leftMargin-cellBox.left;
 }
 function setDay(index,focusFirm=null){
  day=Math.max(0,Math.min(last,index));
  paint(focusFirm,true);
 }
 function setRegion(nextRegion){
  if(!REGIONS.includes(nextRegion))return;
  region=nextRegion;
  paint(null,true);
 }
 prev.addEventListener('click',()=>setDay(day-1));
 next.addEventListener('click',()=>setDay(day+1));
 tabs.addEventListener('click',event=>{
  const btn=event.target.closest('[data-market-region]');
  if(btn)setRegion(btn.dataset.marketRegion);
 });
 tabs.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const index=REGIONS.indexOf(region);
  const nextIndex=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;
  setRegion(REGIONS[nextIndex]);
  tabs.querySelector('[data-market-region="'+region+'"]')?.focus();
  event.preventDefault();
 });
 host.addEventListener('click',event=>{
  const cell=event.target.closest('.mw-cell');
  if(!cell)return;
  setDay(Number(cell.dataset.day),Number(cell.dataset.firm));
 });
 host.addEventListener('pointerover',event=>{
  const cell=event.target.closest('.mw-cell');
  if(!cell)return;
  updateInspection(tooltip(Number(cell.dataset.firm),Number(cell.dataset.day),series.counts[region][Number(cell.dataset.day)][Number(cell.dataset.firm)]));
 });
 host.addEventListener('pointerout',event=>{
  if(event.target.closest('.mw-cell'))updateInspection(overview);
 });
 host.addEventListener('focusin',event=>{
  const cell=event.target.closest('.mw-cell');
  if(cell)updateInspection(tooltip(Number(cell.dataset.firm),Number(cell.dataset.day),series.counts[region][Number(cell.dataset.day)][Number(cell.dataset.firm)]));
 });
 host.addEventListener('focusout',event=>{
  if(event.target.closest('.mw-cell'))updateInspection(overview);
 });
 host.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;
  const cell=event.target.closest('.mw-cell');
  if(!cell)return;
  const rank=sortedFirms(series.counts[region]);
  const currentFirm=Number(cell.dataset.firm),currentDay=Number(cell.dataset.day);
  let nextDay=currentDay,nextFirm=currentFirm;
  if(event.key==='ArrowLeft')nextDay=Math.max(0,currentDay-1);
  if(event.key==='ArrowRight')nextDay=Math.min(last,currentDay+1);
  if(event.key==='Home')nextDay=0;
  if(event.key==='End')nextDay=last;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
   const idx=rank.findIndex(row=>row.i===currentFirm),step=event.key==='ArrowUp'?-1:1;
   nextFirm=rank[Math.max(0,Math.min(rank.length-1,idx+step))].i;
  }
  if(event.key==='Enter'||event.key===' '){setDay(currentDay,currentFirm);}
  else setDay(nextDay,nextFirm);
  event.preventDefault();
 });
 paint(null,false);
 // On narrow screens show the recent days rather than the oldest unseen days.
 if(scroll.scrollWidth>scroll.clientWidth)scroll.scrollLeft=scroll.scrollWidth;
}
const api={FIRMS,REGIONS,LEVELS,firmIndex,aggregate,daily,limit,bandOf,rowTotals,sortedFirms,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
