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
// A concave, labeled count transform improves resolution around 1–5 daily
// records while leaving 0 exactly at the center and preserving count order.
// The radius max is the highest ACTUAL daily count in the selected region/date,
// not a 30-day extreme that can turn every ordinary day into a small dot.
const POWER=.34;
const scaledRadius=(value,max)=>value<=0?0:Math.pow(value/Math.max(1,max),POWER);
const inverseRadius=(fraction,max)=>Math.pow(Math.max(0,fraction),1/POWER)*Math.max(1,max);
const domain=values=>Math.max(1,...values);
const XML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
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
 const cx=318,cy=218,r=140,labelRadius=183;
 const angle=i=>2*Math.PI*i/18-Math.PI/2;
 const coord=(i,rad)=>[cx+Math.cos(angle(i))*rad,cy+Math.sin(angle(i))*rad];
 const point=v=>v.map(x=>x.toFixed(2)).join(',');
 const pathOf=(values,max)=>values.map((v,i)=>(i?'L':'M')+point(coord(i,r*scaledRadius(v,max)))).join(' ')+' Z';
 const rings=[.2,.4,.6,.8,1].map(scale=>'<polygon class="mw-ring" points="'+FIRMS.map((_,i)=>point(coord(i,r*scale))).join(' ')+'"/>').join('');
 const spokes=FIRMS.map((_,i)=>'<line class="mw-spoke" x1="'+cx+'" y1="'+cy+'" x2="'+point(coord(i,r)).replace(',','" y2="')+'"/>').join('');
 function draw(){
  const values=daily(series,region,day),max=domain(values.values),key=series.keys[day],activeIndices=values.values.map((n,i)=>n>0?i:-1).filter(i=>i>=0);
  const labels=FIRMS.map((name,i)=>{
   const [x,y]=coord(i,labelRadius),direction=Math.cos(angle(i));
   const anchor=Math.abs(direction)<.13?'middle':direction>0?'start':'end';
   const xPos=x+(anchor==='start'?5:anchor==='end'?-5:0),klass=values.values[i]?'mw-firm has-roles':'mw-firm';
   return '<text class="'+klass+'" data-firm-label="'+i+'" x="'+xPos.toFixed(2)+'" y="'+(y+3).toFixed(2)+'" text-anchor="'+anchor+'"><title>'+XML(name)+' · '+values.values[i]+' new postings</title>'+XML(SHORT[i])+'</text>';
  }).join('');
  const shape=values.total?'<path class="mw-area" d="'+pathOf(values.values,max)+'"/>':'';
  const singles=activeIndices.length===1?'<line class="mw-single" x1="'+cx+'" y1="'+cy+'" x2="'+point(coord(activeIndices[0],r*scaledRadius(values.values[activeIndices[0]],max))).replace(',','" y2="')+'"/>':'';
  const focusCounts=[...activeIndices].sort((a,b)=>values.values[b]-values.values[a]||a-b).slice(0,3);
  const circles=activeIndices.map(i=>{
   const [x,y]=coord(i,r*scaledRadius(values.values[i],max)),n=values.values[i];
   const label=XML(FIRMS[i]+' · '+n+' new postings · '+key+' · '+(region==='all'?'all regions':region));
   const theta=angle(i),dx=Math.cos(theta)*11,dy=Math.sin(theta)*11;
   const callout=focusCounts.includes(i)?'<text class="mw-value" x="'+(x+dx).toFixed(2)+'" y="'+(y+dy+3).toFixed(2)+'" text-anchor="middle">'+n+'</text>':'';
   return '<g class="mw-point" data-firm="'+i+'" tabindex="0" role="img" aria-label="'+label+'"><circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="4.2"/><title>'+label+'</title>'+callout+'</g>';
  }).join('');
  const empty=values.total===0?'<text class="mw-empty" x="'+cx+'" y="'+(cy-3)+'" text-anchor="middle">No new roles</text><text class="mw-empty-date" x="'+cx+'" y="'+(cy+14)+'" text-anchor="middle">recorded for this date</text>':'';
  const axisLabels=max>1?[1,max]:[1];
  const ticks=axisLabels.map(n=>{
   const fraction=scaledRadius(n,max),y=cy-r*fraction;
   return '<text class="mw-tick" x="'+(cx+7)+'" y="'+(y-4).toFixed(2)+'">'+XML(fmt(n))+'</text>';
  }).join('');
  const accessible='Market Width, '+key+', '+(region==='all'?'all regions':region)+', '+values.total+' new postings in '+values.firms+' of 18 tracked institutions. A compressed, recalibrated radial count scale; exact values in the table.';
  host.innerHTML='<svg class="mw-svg" viewBox="0 0 640 442" role="img" aria-label="'+XML(accessible)+'"><title>Market Width · daily new postings</title><desc>Each spoke is one tracked firm. Zero remains at the center. The radial count scale is compressed and recalibrated by day and region, so silhouette area must not be used to compare dates. Read exact counts in the accessible table.</desc><g aria-hidden="true">'+rings+spokes+ticks+'</g>'+shape+singles+circles+labels+empty+'</svg>';
  dateText.textContent=key;countText.textContent=fmt(values.total);firmText.textContent=values.firms+' / 18';
  slider.value=String(day);prev.disabled=day===0;next.disabled=day===last;
  if(scaleText)scaleText.textContent='COUNT SCALE  0–'+fmt(max)+' · ADAPTIVE';
  if(note)note.textContent=accessible;
  if(inspection)inspection.textContent=values.firms?('Highest: '+[...activeIndices].sort((a,b)=>values.values[b]-values.values[a]||a-b).slice(0,2).map(i=>FIRMS[i]+' '+values.values[i]).join(' · ')):'No recorded first-seen roles on this date';
  detail.replaceChildren(...FIRMS.map((name,i)=>{
   const tr=document.createElement('tr');
   for(const value of [name,String(values.values[i])]){
    const td=document.createElement('td');td.textContent=value;tr.append(td);
   }
   return tr;
  }));
  tabs.querySelectorAll('[data-market-region]').forEach(btn=>{
   const selected=btn.dataset.marketRegion===region;
   btn.classList.toggle('active',selected);btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;
  });
  host.querySelectorAll('.mw-point').forEach(g=>{
   const show=()=>{const i=Number(g.dataset.firm);if(inspection)inspection.textContent=FIRMS[i]+' · '+values.values[i]+' new postings';host.querySelectorAll('[data-firm-label]').forEach(n=>n.classList.toggle('is-focused',Number(n.dataset.firmLabel)===i));};
   g.addEventListener('pointerenter',show);g.addEventListener('focus',show);
  });
  host.addEventListener('pointerleave',()=>{host.querySelectorAll('[data-firm-label]').forEach(n=>n.classList.remove('is-focused'));},{once:true});
 }
 slider.addEventListener('input',()=>{day=Number(slider.value);draw();});
 prev.addEventListener('click',()=>{day=Math.max(0,day-1);draw();});
 next.addEventListener('click',()=>{day=Math.min(last,day+1);draw();});
 tabs.addEventListener('click',event=>{
  const btn=event.target.closest('[data-market-region]');if(!btn)return;
  region=btn.dataset.marketRegion;draw();
 });
 tabs.addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  const pos=REGIONS.indexOf(region);
  region=REGIONS[event.key==='Home'?0:event.key==='End'?3:(pos+(event.key==='ArrowRight'?1:3))%4];
  draw();tabs.querySelector('[data-market-region="'+region+'"]')?.focus();event.preventDefault();
 });
 draw();
}
const api={FIRMS,REGIONS,firmIndex,aggregate,daily,limit,POWER,domain,scaledRadius,inverseRadius,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.MarketWidth=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
