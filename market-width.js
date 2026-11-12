/* Market Width: one integrated 18-institution market map. Muted neutral
   placeholders indicate zero new postings (no visible zero digits). Positive
   posting tiles preserve their relative count proportions, with a tiny visual
   floor for genuinely unreadable cells. Positive and zero-value tiles share
   the regular squarified treemap with no forced center or perimeter bands.
   Counts retain their exact first-seen, currently-active meaning. */
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
/* A zero datum has no quantitative area, but the user needs all eighteen
   institutions visible in one coherent mosaic. Give neutral placeholders a
   small, NON-QUANTITATIVE visual footprint, then distribute the remaining
   area among positive counts. A small display floor is used only when a
   strictly proportional positive cell would be too tiny to label. */
function marketTiles(values,width=640,height=340){
 const W=Math.max(1,Number(width)||640),H=Math.max(1,Number(height)||340);
 const input=(values||[]).map(n=>Math.max(0,Number(n)||0));
 const positive=input.map((count,i)=>({i,count})).filter(t=>t.count>0);
 const zeros=input.map((count,i)=>({i,count})).filter(t=>t.count===0);
 if(!positive.length){
  return treemap(input.map((_,i)=>({i,count:1})),W,H)
   .map(r=>({...r,count:0,zero:true,visualFloor:false}));
 }
 const total=positive.reduce((sum,t)=>sum+t.count,0);
 const zeroShare=Math.min(.30,zeros.length*.020);
 // Preserve the original squarified placement. Raise the display-only
 // floor only for extreme skew so a 700:1 positive cell is not a 7px sliver.
 const minEdge=Math.max(18,Math.min(22,W*.045));
 const readableFloor=Math.max(.0135,minEdge*Math.max(W,H)/(W*H));
 const floor=Math.min(readableFloor,(1-zeroShare)/Math.max(1,positive.length*1.4));
 let free=1-zeroShare,remainingTotal=total;
 let unassigned=[...positive],allocated=[];
 // Water filling makes floor-adjustments local while preserving the ratios
 // of all other positive institutions.
 while(unassigned.length){
  const tiny=unassigned.filter(t=>free*t.count/remainingTotal<floor-1e-10);
  if(!tiny.length){
   allocated.push(...unassigned.map(t=>({i:t.i,weight:free*t.count/remainingTotal,visualFloor:false})));
   break;
  }
  allocated.push(...tiny.map(t=>({i:t.i,weight:floor,visualFloor:true})));
  free-=tiny.length*floor;
  remainingTotal-=tiny.reduce((sum,t)=>sum+t.count,0);
  unassigned=unassigned.filter(t=>!tiny.some(a=>a.i===t.i));
 }
 const weighted=[
  ...allocated.map(t=>({i:t.i,count:t.weight})),
  ...zeros.map(t=>({i:t.i,count:zeroShare/zeros.length}))
 ];
 const floored=new Set(allocated.filter(t=>t.visualFloor).map(t=>t.i));
 return treemap(weighted,W,H).map(r=>({
  ...r,count:input[r.i],zero:input[r.i]===0,visualFloor:floored.has(r.i)
 }));
}
/* A restrained five-ink categorical palette differentiates neighboring
   positive rectangles. These are visual distinctions, not a second scale:
   area and the exact numeral still encode posting volume. Stable firm
   preferences minimize color changes; an actual shared edge takes priority
   over preference so two touching positive tiles never merge optically.
   Rectangles, values and the original squarified geometry are untouched. */
const PREFERRED_INK=Object.freeze([0,1,2,3,4,0,3,1,4,2,0,2,3,1,4,0,4,1]);
function colorTiles(tiles){
 const active=(tiles||[]).filter(t=>!t.zero);
 const count=active.length;
 const paint=Array(count).fill(-1);
 const neighbors=Array.from({length:count},()=>[]);
 const touches=(a,b)=>{
  const x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
  const y=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
  return ((Math.abs(a.x+a.w-b.x)<.02||Math.abs(b.x+b.w-a.x)<.02)&&y>.5)
   ||((Math.abs(a.y+a.h-b.y)<.02||Math.abs(b.y+b.h-a.y)<.02)&&x>.5);
 };
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)
  if(touches(active[i],active[j])){neighbors[i].push(j);neighbors[j].push(i)}
 function assign(remaining){
  if(!remaining)return true;
  let next=-1,rank=-1;
  for(let i=0;i<count;i++){
   if(paint[i]>=0)continue;
   const sat=new Set(neighbors[i].map(j=>paint[j]).filter(x=>x>=0)).size;
   const score=sat*100000+neighbors[i].length*1000+
    Math.min(999,(active[i].w*active[i].h)/1000);
   if(score>rank){rank=score;next=i}
  }
  const forbidden=new Set(neighbors[next].map(j=>paint[j]).filter(x=>x>=0));
  const preference=PREFERRED_INK[active[next].i]??0;
  const usage=Array(5).fill(0);
  paint.forEach(c=>{if(c>=0)usage[c]++});
  const options=[0,1,2,3,4].filter(c=>!forbidden.has(c))
   .sort((a,b)=>(a===preference?-10:usage[a])-
                 (b===preference?-10:usage[b]) || a-b);
  for(const color of options){
   paint[next]=color;
   if(assign(remaining-1))return true;
   paint[next]=-1;
  }
  return false;
 }
 if(!assign(count))throw new Error('Market Width color adjacency cannot be resolved');
 const byFirm=Array(18).fill(null);
 active.forEach((t,j)=>{byFirm[t.i]=paint[j]});
 return byFirm;
}
/* One visual grammar regardless of box size:
   a centred vertical lockup, name above count (zero: name only).
   Typography is determined by each rectangle, not the number of firms
   active on that date, and then fitted against actual rendered text. */
function tileTypography(w,h){
 const area=w*h;
 if(w>=210&&h>=95&&area>=24500)return {tier:'feature',name:21,count:30,gap:9};
 if(w>=145&&h>=76&&area>=11500)return {tier:'large',name:16,count:23,gap:6};
 if(w>=78&&h>=56&&area>=6000)return {tier:'medium',name:12.5,count:17,gap:4};
 return {tier:'small',name:10,count:12,gap:2};
}
function fitTileContent(button,rect,zero){
 const face=button.querySelector('.mw-tile-face');
 const name=button.querySelector('.mw-tile-name');
 const count=button.querySelector('.mw-tile-count');
 const lockup=button.querySelector('.mw-tile-lockup');
 const initial=tileTypography(rect.w,rect.h);
 const allowed=rect.w>=82&&rect.h>=70
  ?[DISPLAY[rect.i],COMPACT[rect.i],MICRO[rect.i]]
  :rect.w>=70&&rect.h>=48
   ?[COMPACT[rect.i],MICRO[rect.i]]
   :[MICRO[rect.i]];
 const computed=getComputedStyle(face);
 const availableH=face.clientHeight-parseFloat(computed.paddingTop)-parseFloat(computed.paddingBottom);
 // Preserve a readable count. Reduce name size and use approved names before
 // allowing any overlap or clipping. Measurements use the real rendered font.
 for(let size=initial.name;size>=8;size-=.5){
  name.style.fontSize=size+'px';
  if(count)count.style.fontSize=Math.max(10,initial.count-(initial.name-size)*.9)+'px';
  lockup.style.gap=Math.max(1,initial.gap-(initial.name-size)*.22)+'px';
  for(const label of [...new Set(allowed)]){
   name.textContent=label;
   if(name.scrollWidth<=name.clientWidth+.75 &&
      lockup.scrollHeight<=availableH+.75 &&
      lockup.scrollWidth<=lockup.clientWidth+.75){
    button.dataset.labelForm=label===DISPLAY[rect.i]?'full':label===COMPACT[rect.i]?'compact':'micro';
    button.dataset.fontFit=String(size);
    return;
   }
  }
 }
 // Subpixel and extraordinarily narrow rectangles may not fit two glyphs at
 // any standard size; keep both fields stacked and retain full accessible text.
 name.textContent=MICRO[rect.i];name.style.fontSize='8px';
 if(count)count.style.fontSize='10px';
 lockup.style.gap='1px';
 button.dataset.labelForm='micro';
 button.dataset.fontFit='8';
}
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
 const datum=i=>series.counts[region][day][i];
 const label=i=>{
  const n=datum(i),what=n>0?fmt(n)+' new '+(n===1?'posting':'postings'):'No new postings';
  return DISPLAY[i]+' · '+what+' · '+series.keys[day]+' · '+(region==='all'?'all regions':region);
 };
 const quietDetail=()=>{if(selectedFirm===null){detail.textContent='';detail.hidden=true;}};
 const explain=i=>{detail.textContent=label(i);detail.hidden=false;};
 function draw(){
  const data=daily(series,region,day),values=data.values;
  rootEl.classList.toggle('is-all-zero',data.firms===0);
  const width=Math.max(1,Math.round(board.getBoundingClientRect().width||540));
  const height=Math.max(1,Math.round(board.getBoundingClientRect().height||320));
  const tiles=marketTiles(values,width,height);
  const colors=colorTiles(tiles);
  const fragment=document.createDocumentFragment();
  for(const tile of tiles){
   const button=document.createElement('button');
   const zero=tile.zero,type=tileTypography(tile.w,tile.h);
   button.type='button';
   button.className='mw-tile '+(zero?'mw-is-zero':'mw-is-active mw-hue-'+colors[tile.i])+
    ' mw-tile-'+type.tier+(!zero&&tile.visualFloor?' mw-display-floor':'');
   button.dataset.layout=type.tier;
   button.dataset.firm=String(tile.i);
   button.dataset.zero=String(zero);
   button.setAttribute('aria-label',label(tile.i));
   button.setAttribute('aria-pressed',String(selectedFirm===tile.i));
   button.title=label(tile.i);
   button.style.left=(tile.x/width*100).toFixed(5)+'%';
   button.style.top=(tile.y/height*100).toFixed(5)+'%';
   button.style.width=(tile.w/width*100).toFixed(5)+'%';
   button.style.height=(tile.h/height*100).toFixed(5)+'%';
   const face=document.createElement('span');face.className='mw-tile-face';
   const lockup=document.createElement('span');lockup.className='mw-tile-lockup';
   const name=document.createElement('span');name.className='mw-tile-name';
   name.textContent=DISPLAY[tile.i];
   lockup.append(name);
   if(!zero){
    const amount=document.createElement('strong');amount.className='mw-tile-count';
    amount.textContent=fmt(tile.count);lockup.append(amount);
   }
   face.append(lockup);button.append(face);fragment.append(button);
  }
  board.replaceChildren(fragment);
  // Measure and fit against actual DOM dimensions once per date, region or
  // board resize, never during hover. Every positive tile remains stacked.
  for(const tile of tiles){
   const button=board.querySelector('.mw-tile[data-firm="'+tile.i+'"]');
   if(button)fitTileContent(button,tile,tile.zero);
  }
  count.textContent=fmt(data.total);firms.textContent=data.firms+'/18';
  date.textContent=prettyDate(series.keys[day]);date.setAttribute('aria-label',series.keys[day]);
  prev.disabled=day===0;next.disabled=day===last;
  tabs.querySelectorAll('[data-market-region]').forEach(tab=>{
   const on=tab.dataset.marketRegion===region;
   tab.classList.toggle('active',on);tab.setAttribute('aria-selected',String(on));
   tab.tabIndex=on?0:-1;
  });
  selectedFirm=null;detail.hidden=true;detail.textContent='';
  lastSize=width+'x'+height;
 }
 function chooseDay(next){
  const to=Math.max(0,Math.min(last,next));if(to===day)return;day=to;draw();
 }
 function chooseRegion(value){
  if(!REGIONS.includes(value)||value===region)return;region=value;draw();
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
  tabs.querySelector('[data-market-region="'+region+'"]')?.focus();e.preventDefault();
 });
 board.addEventListener('pointerover',e=>{
  const tile=e.target.closest('.mw-tile');if(tile)explain(Number(tile.dataset.firm));
 });
 board.addEventListener('pointerout',e=>{
  if(e.target.closest('.mw-tile')&&!board.querySelector('.mw-tile:hover'))quietDetail();
 });
 board.addEventListener('focusin',e=>{
  const tile=e.target.closest('.mw-tile');if(tile)explain(Number(tile.dataset.firm));
 });
 board.addEventListener('focusout',e=>{
  if(e.target.closest('.mw-tile'))quietDetail();
 });
 board.addEventListener('click',e=>{
  const tile=e.target.closest('.mw-tile');if(!tile)return;
  const chosen=Number(tile.dataset.firm);
  selectedFirm=selectedFirm===chosen?null:chosen;
  board.querySelectorAll('.mw-tile').forEach(item=>item.setAttribute('aria-pressed',String(Number(item.dataset.firm)===selectedFirm)));
  if(selectedFirm===null)quietDetail();else explain(selectedFirm);
 });
 board.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))return;
  if(e.key==='Escape'){
   selectedFirm=null;quietDetail();
   board.querySelectorAll('.mw-tile').forEach(t=>t.setAttribute('aria-pressed','false'));
   e.preventDefault();return;
  }
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
const api={FIRMS,DISPLAY,COMPACT,MICRO,REGIONS,firmIndex,aggregate,daily,limit,treemap,marketTiles,colorTiles,tileTypography,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
