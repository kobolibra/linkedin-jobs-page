/* Market Width: daily, area-proportional market map. Zero-posting institutions
   are absent from the visualization, but included in the 18-firm denominator.
   The underlying daily-first-seen, currently-active data contract is unchanged. */
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
/* Carefully selected capital-markets/brand shorthand, NEVER arbitrary truncation.
   Full official DISPLAY names remain in accessible labels and tooltips.
   Examples: Morgan Stanley MS (NYSE), Standard Chartered SC (SEC filings),
   JPMorgan/JPM, BofA, SocGen, GS and FIL. */
const COMPACT=Object.freeze([
 'HSBC','Standard Chartered','Citi','JPMorgan','BNP Paribas',
 'SocGen','DBS','Deutsche Bank','Goldman Sachs','BlackRock',
 'BofA','Fidelity Intl.','Morgan Stanley','BBVA','Natixis',
 'UBS','Schroders','Invesco'
]);
const MICRO=Object.freeze([
 'HSBC','SC','Citi','JPM','BNP','SG','DBS','DB','GS','BLK',
 'BofA','FIL','MS','BBVA','Natixis','UBS','SDR','IVZ'
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

/* Squarified treemap: rectangles cover exactly the full positive-count area.
   The geometry is proportional to counts, NOT sqrt(counts), a count floor,
   or an artificial minimum size. Stable count-descending order breaks ties by
   the institution's canonical registry position. */
function treemap(values,width=640,height=340){
 const W=Math.max(1,Number(width)||640),H=Math.max(1,Number(height)||340);
 const items=(values||[]).map((item,index)=>({
  i:Number.isInteger(item.i)?item.i:index,
  count:Number(item.count)||0
 })).filter(item=>item.count>0).sort((a,b)=>b.count-a.count||a.i-b.i);
 if(!items.length)return [];
 const total=items.reduce((sum,item)=>sum+item.count,0),unit=W*H/total;
 const blocks=items.map(item=>({...item,area:item.count*unit}));
 let remaining={x:0,y:0,w:W,h:H};
 const out=[];let row=[];
 const worst=(line,side)=>{
  const a=line.map(item=>item.area),sum=a.reduce((x,y)=>x+y,0);
  return Math.max(side*side*Math.max(...a)/(sum*sum),
   sum*sum/(side*side*Math.min(...a)));
 };
 const commit=()=>{
  if(!row.length)return;
  const sum=row.reduce((a,b)=>a+b.area,0);
  if(remaining.w>=remaining.h){
   const depth=remaining.h,strip=Math.min(remaining.w,sum/Math.max(depth,1e-9));
   let offset=remaining.y;
   row.forEach((item,index)=>{
    const height=index===row.length-1
     ?Math.max(0,remaining.y+remaining.h-offset):item.area/Math.max(strip,1e-9);
    out.push({i:item.i,count:item.count,x:remaining.x,y:offset,w:strip,h:height});
    offset+=height;
   });
   remaining={x:remaining.x+strip,y:remaining.y,w:Math.max(0,remaining.w-strip),h:remaining.h};
  }else{
   const depth=remaining.w,strip=Math.min(remaining.h,sum/Math.max(depth,1e-9));
   let offset=remaining.x;
   row.forEach((item,index)=>{
    const width=index===row.length-1
     ?Math.max(0,remaining.x+remaining.w-offset):item.area/Math.max(strip,1e-9);
    out.push({i:item.i,count:item.count,x:offset,y:remaining.y,w:width,h:strip});
    offset+=width;
   });
   remaining={x:remaining.x,y:remaining.y+strip,w:remaining.w,h:Math.max(0,remaining.h-strip)};
  }
  row=[];
 };
 for(const item of blocks){
  if(!row.length){row=[item];continue;}
  const side=Math.max(1e-8,Math.min(remaining.w,remaining.h));
  if(worst([...row,item],side)<=worst(row,side)+1e-10)row.push(item);
  else{commit();row=[item];}
 }
 commit();
 return out;
}
const toneOf=n=>n<=1?1:n<=3?2:n<=7?3:n<=15?4:5;
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
const prettyDate=key=>{
 const m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!m)return String(key||'');
 return new Date(+m[1],+m[2]-1,+m[3],12).toLocaleDateString('en-US',{month:'short',day:'numeric'});
};
function render(rows,days){
 if(typeof document==='undefined'||!Array.isArray(days)||days.length===0)return;
 const el=id=>document.getElementById(id),rootEl=el('marketWidth'),board=el('marketWidthMap');
 const detail=el('marketWidthDetail');
 const prev=el('marketWidthPrev'),next=el('marketWidthNext'),date=el('marketWidthDate');
 const count=el('marketWidthCount'),firms=el('marketWidthFirms'),tabs=el('marketWidthRegions');
 if(!rootEl||!board||!detail||!prev||!next||!date||!count||!firms||!tabs)return;
 const series=aggregate(rows,days),last=series.keys.length-1;
 let day=series.counts.all.findLastIndex(line=>line.some(Boolean));
 if(day<0)day=last;
 let region='all',selectedFirm=null,lastSize='';
 const label=(i,n)=>DISPLAY[i]+' · '+fmt(n)+' new '+(n===1?'posting':'postings')+' · '+series.keys[day]+' · '+(region==='all'?'all regions':region);
 const quietDetail=()=>{if(selectedFirm===null){detail.textContent='';detail.hidden=true;}};
 const explain=i=>{
  const n=series.counts[region][day][i];
  detail.textContent=label(i,n);
  detail.hidden=false;
 };
 function draw(){
  const data=daily(series,region,day),values=data.values;
  const active=values.map((n,i)=>({i,count:n})).filter(item=>item.count>0);
  rootEl.classList.toggle('is-all-zero',active.length===0);
  const fallbackWidth=board.getBoundingClientRect().width||540;
  const fallbackHeight=board.getBoundingClientRect().height||320;
  const width=Math.max(1,Math.round(fallbackWidth)),height=Math.max(1,Math.round(fallbackHeight));
  const tiles=treemap(active,width,height);
  board.replaceChildren();
  if(!tiles.length){
   const empty=document.createElement('p');empty.className='mw-empty';
   empty.textContent='No new postings recorded';board.append(empty);
  }else{
   const fragment=document.createDocumentFragment();
   for(const tile of tiles){
    const button=document.createElement('button');
    button.type='button';
    const tiny=tile.w<63||tile.h<35;
    const compact=tile.w<155||tile.h<68;
    button.className='mw-tile mw-tone-'+toneOf(tile.count)+
     (active.length>=10?' mw-tile-dense':'')+
     (compact?' mw-tile-compact':'')+(tiny?' mw-tile-tiny':'');
    button.dataset.firm=String(tile.i);
    button.setAttribute('aria-label',label(tile.i,tile.count));
    button.title=label(tile.i,tile.count);
    button.setAttribute('aria-pressed',String(selectedFirm===tile.i));
    button.style.left=(tile.x/width*100).toFixed(5)+'%';
    button.style.top=(tile.y/height*100).toFixed(5)+'%';
    button.style.width=(tile.w/width*100).toFixed(5)+'%';
    button.style.height=(tile.h/height*100).toFixed(5)+'%';
    const face=document.createElement('span');face.className='mw-tile-face';
    const name=document.createElement('span');name.className='mw-tile-name';
    name.textContent=tiny?MICRO[tile.i]:compact?COMPACT[tile.i]:DISPLAY[tile.i];
    const amount=document.createElement('strong');amount.className='mw-tile-count';
    amount.textContent=fmt(tile.count);
    // Every positive tile has a visible name/token AND its exact count.
    // Narrow rectangles use vetted financial-market abbreviations, not blanks.
    face.append(name,amount);
    button.append(face);fragment.append(button);
   }
   board.append(fragment);
  }
  count.textContent=fmt(data.total);
  firms.textContent=data.firms+'/18';
  date.textContent=prettyDate(series.keys[day]);
  date.setAttribute('aria-label',series.keys[day]);
  prev.disabled=day===0;next.disabled=day===last;
  tabs.querySelectorAll('[data-market-region]').forEach(tab=>{
   const on=tab.dataset.marketRegion===region;
   tab.classList.toggle('active',on);
   tab.setAttribute('aria-selected',String(on));
   tab.tabIndex=on?0:-1;
  });
  selectedFirm=null;detail.hidden=true;detail.textContent='';
  lastSize=width+'x'+height;
 }
 function chooseDay(next){
  const to=Math.max(0,Math.min(last,next));
  if(to===day)return;day=to;draw();
 }
 function chooseRegion(value){
  if(!REGIONS.includes(value)||value===region)return;
  region=value;draw();
 }
 prev.addEventListener('click',()=>chooseDay(day-1));
 next.addEventListener('click',()=>chooseDay(day+1));
 tabs.addEventListener('click',e=>{
  const target=e.target.closest('[data-market-region]');
  if(target)chooseRegion(target.dataset.marketRegion);
 });
 tabs.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const index=REGIONS.indexOf(region);
  chooseRegion(REGIONS[e.key==='Home'?0:e.key==='End'?3:(index+(e.key==='ArrowRight'?1:3))%4]);
  tabs.querySelector('[data-market-region="'+region+'"]')?.focus();
  e.preventDefault();
 });
 board.addEventListener('pointerover',e=>{
  const tile=e.target.closest('.mw-tile');
  if(tile)explain(Number(tile.dataset.firm));
 });
 board.addEventListener('pointerout',e=>{
  if(e.target.closest('.mw-tile')&&!board.querySelector('.mw-tile:hover'))quietDetail();
 });
 board.addEventListener('focusin',e=>{
  const tile=e.target.closest('.mw-tile');
  if(tile)explain(Number(tile.dataset.firm));
 });
 board.addEventListener('focusout',e=>{
  if(e.target.closest('.mw-tile'))quietDetail();
 });
 board.addEventListener('click',e=>{
  const tile=e.target.closest('.mw-tile');
  if(!tile)return;
  const chosen=Number(tile.dataset.firm);
  selectedFirm=selectedFirm===chosen?null:chosen;
  board.querySelectorAll('.mw-tile').forEach(item=>item.setAttribute('aria-pressed',String(Number(item.dataset.firm)===selectedFirm)));
  if(selectedFirm===null)quietDetail();else explain(selectedFirm);
 });
 board.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))return;
  if(e.key==='Escape'){selectedFirm=null;quietDetail();board.querySelectorAll('.mw-tile').forEach(t=>t.setAttribute('aria-pressed','false'));e.preventDefault();return;}
  const available=[...board.querySelectorAll('.mw-tile')],idx=available.indexOf(document.activeElement);
  if(idx<0||available.length<2)return;
  const step=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
  available[(idx+step+available.length)%available.length].focus();e.preventDefault();
 });
 draw();
 if(typeof ResizeObserver==='function'){
  new ResizeObserver(()=>{
   const size=Math.round(board.getBoundingClientRect().width)+'x'+Math.round(board.getBoundingClientRect().height);
   if(size!==lastSize)draw();
  }).observe(board);
 }else if(root?.addEventListener)root.addEventListener('resize',()=>{
  const size=Math.round(board.getBoundingClientRect().width)+'x'+Math.round(board.getBoundingClientRect().height);
  if(size!==lastSize)draw();
 });
}
const api={FIRMS,DISPLAY,COMPACT,MICRO,REGIONS,firmIndex,aggregate,daily,limit,treemap,toneOf,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
