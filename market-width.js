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
// Match the official institution names in About. Never invent visual-only
// abbreviations: in particular, not "Standard C." or "Morgan St.".
const DISPLAY=Object.freeze([
 'HSBC','Standard Chartered','Citi','JPMorgan Chase','BNP Paribas',
 'Société Générale','DBS Bank','Deutsche Bank','Goldman Sachs',
 'BlackRock','Bank of America','Fidelity International',
 'Morgan Stanley','BBVA','Natixis','UBS','Schroders','Invesco'
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
 {label:"8+",min:8,max:Infinity}
]);
const bandOf=n=>n<=0?0:n===1?1:n<=3?2:n<=7?3:4;
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
 const dateText=el('marketWidthDate'),firmText=el('marketWidthFirms'),countText=el('marketWidthCount'),tabs=el('marketWidthRegions');
 if(!host||!scroll||!prev||!next||!dateText||!firmText||!countText||!tabs)return;
 const series=aggregate(rows,days),last=series.keys.length-1;
 let day=series.counts.all.findLastIndex(row=>row.some(Boolean));
 if(day<0)day=last;
 let region='all';
 const tooltip=(i,j,n)=>FIRMS[i]+' · '+prettyDate(series.keys[j])+' · '+n+' new '+(n===1?'posting':'postings');
 const gridCell=(i,j,n,selected,tabStop)=>{
  const title=escapeHTML(tooltip(i,j,n));
  return '<button type="button" role="gridcell" aria-colindex="'+(j+2)+'" aria-selected="'+String(selected)+'"'+
   ' aria-label="'+title+'" title="'+title+'" data-firm="'+i+'" data-day="'+j+'"'+
   ' tabindex="'+(tabStop?'0':'-1')+'" class="mw-cell mw-level-'+bandOf(n)+(selected?' is-selected':'')+'"></button>';
 };
 function displaySelected(){
  const snapshot=daily(series,region,day),key=series.keys[day];
  countText.textContent=fmt(snapshot.total);
  firmText.textContent=snapshot.firms+'/18';
  dateText.textContent=prettyDate(key);
  dateText.setAttribute('aria-label',key);
  prev.disabled=day===0;next.disabled=day===last;
 }
 function positionFocus(){
  const marker=host.querySelector('.mw-column-focus');
  const col=host.querySelector('.mw-day-head[data-day="'+day+'"]');
  const first=host.querySelector('.mw-company-row'),lastRow=host.querySelector('.mw-company-row:last-of-type');
  if(!marker||!col||!first||!lastRow)return;
  const base=host.getBoundingClientRect(),headBox=col.getBoundingClientRect();
  const firstBox=first.getBoundingClientRect(),endBox=lastRow.getBoundingClientRect();
  marker.style.left=(headBox.left-base.left-.5)+'px';
  marker.style.width=(headBox.width+1)+'px';
  marker.style.top=(firstBox.top-base.top-2)+'px';
  marker.style.height=(endBox.bottom-firstBox.top+4)+'px';
 }
 function ensureVisible(){
  const cell=host.querySelector('.mw-cell[data-day="'+day+'"]');
  if(!cell||scroll.scrollWidth<=scroll.clientWidth)return;
  const a=scroll.getBoundingClientRect(),b=cell.getBoundingClientRect();
  const inset=scroll.clientWidth<480?111:9;
  if(b.right>a.right-8)scroll.scrollLeft+=b.right-a.right+14;
  else if(b.left<a.left+inset)scroll.scrollLeft-=a.left+inset-b.left;
 }
 // Only region changes re-create the matrix, because the institution ordering
 // changes. Date changes update 36 cell classes + a highlight, and never change
 // the grid's height or insert hover content into document flow.
 function paintRegion(focusFirm=null){
  const x=scroll.scrollLeft,rank=sortedFirms(series.counts[region]),counts=series.counts[region];
  const headers=series.keys.map((key,j)=>
   '<span role="columnheader" class="mw-day-head" data-day="'+j+'" aria-label="'+escapeHTML(key)+'" title="'+escapeHTML(key)+'"></span>').join('');
  const head='<div role="row" class="mw-matrix-row mw-header"><span role="columnheader" class="mw-head-firm">Institution</span>'+
   headers+'<span role="columnheader" class="mw-head-total">30d</span></div>';
  const lines=rank.map(({i,total},index)=>{
   const label='<span class="mw-company" role="rowheader" aria-label="'+escapeHTML(FIRMS[i])+'" title="'+escapeHTML(FIRMS[i])+'">'+
    '<span class="mw-rank">'+String(index+1).padStart(2,'0')+'</span><span class="mw-company-name">'+escapeHTML(DISPLAY[i])+'</span></span>';
   const cells=series.keys.map((_,j)=>gridCell(i,j,counts[j][i],j===day,index===0&&j===day)).join('');
   return '<div class="mw-matrix-row mw-company-row" role="row" data-firm-row="'+i+'" aria-rowindex="'+(index+2)+'">'+
    label+cells+'<span class="mw-row-total" role="gridcell" aria-label="'+escapeHTML(FIRMS[i])+' 30-day new posting total '+total+'">'+fmt(total)+'</span></div>';
  }).join('');
  host.style.setProperty('--mw-days',String(series.keys.length));
  host.setAttribute('aria-rowcount',String(rank.length+1));
  host.setAttribute('aria-colcount',String(series.keys.length+2));
  host.innerHTML=head+lines+'<span class="mw-column-focus" aria-hidden="true"></span>';
  tabs.querySelectorAll('[data-market-region]').forEach(btn=>{
   const active=btn.dataset.marketRegion===region;
   btn.classList.toggle('active',active);
   btn.setAttribute('aria-selected',String(active));
   btn.tabIndex=active?0:-1;
  });
  displaySelected();
  positionFocus();
  scroll.scrollLeft=x;
  ensureVisible();
  if(focusFirm!==null)host.querySelector('.mw-cell[data-firm="'+focusFirm+'"][data-day="'+day+'"]')?.focus({preventScroll:true});
 }
 function chooseDay(next,focusFirm=null){
  const selected=Math.max(0,Math.min(last,next));
  const changed=selected!==day;
  if(changed){
   const older=host.querySelectorAll('.mw-cell[data-day="'+day+'"]');
   older.forEach(cell=>{cell.classList.remove('is-selected');cell.setAttribute('aria-selected','false');cell.tabIndex=-1;});
   day=selected;
   const newer=host.querySelectorAll('.mw-cell[data-day="'+day+'"]');
   newer.forEach((cell,i)=>{cell.classList.add('is-selected');cell.setAttribute('aria-selected','true');cell.tabIndex=i===0?0:-1;});
  }
  if(focusFirm!==null){
   const target=host.querySelector('.mw-cell[data-firm="'+focusFirm+'"][data-day="'+day+'"]');
   if(target){host.querySelectorAll('.mw-cell[tabindex="0"]').forEach(cell=>cell.tabIndex=-1);target.tabIndex=0;target.focus({preventScroll:true});}
  }
  displaySelected();
  positionFocus();
  ensureVisible();
 }
 function chooseRegion(next){
  if(!REGIONS.includes(next)||next===region)return;
  region=next;paintRegion();
 }
 prev.addEventListener('click',()=>chooseDay(day-1));
 next.addEventListener('click',()=>chooseDay(day+1));
 tabs.addEventListener('click',event=>{
  const btn=event.target.closest('[data-market-region]');
  if(btn)chooseRegion(btn.dataset.marketRegion);
 });
 tabs.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const i=REGIONS.indexOf(region);
  const next=REGIONS[event.key==='Home'?0:event.key==='End'?3:(i+(event.key==='ArrowRight'?1:3))%4];
  chooseRegion(next);tabs.querySelector('[data-market-region="'+next+'"]')?.focus();
  event.preventDefault();
 });
 host.addEventListener('click',event=>{
  const cell=event.target.closest('.mw-cell');
  if(cell)chooseDay(Number(cell.dataset.day),Number(cell.dataset.firm));
 });
 host.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;
  const cell=event.target.closest('.mw-cell');
  if(!cell)return;
  const firm=Number(cell.dataset.firm),oldDay=Number(cell.dataset.day);
  let next=oldDay,nextFirm=firm;
  if(event.key==='ArrowLeft')next=Math.max(0,oldDay-1);
  if(event.key==='ArrowRight')next=Math.min(last,oldDay+1);
  if(event.key==='Home')next=0;
  if(event.key==='End')next=last;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
   const sorted=sortedFirms(series.counts[region]),index=sorted.findIndex(x=>x.i===firm);
   const change=event.key==='ArrowUp'?-1:1;
   nextFirm=sorted[Math.min(sorted.length-1,Math.max(0,index+change))].i;
  }
  chooseDay(next,nextFirm);
  event.preventDefault();
 });
 paintRegion();
 if(typeof ResizeObserver==='function')new ResizeObserver(positionFocus).observe(host);
 else if(root?.addEventListener)root.addEventListener('resize',positionFocus);
 if(scroll.scrollWidth>scroll.clientWidth)ensureVisible();
}
const api={FIRMS,DISPLAY,REGIONS,LEVELS,firmIndex,aggregate,daily,limit,bandOf,rowTotals,sortedFirms,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
