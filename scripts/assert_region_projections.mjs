/* Shared assertions for real browser projection geometry; no request stubs. */
import assert from 'node:assert/strict';
export async function assertRegionProjections(page){
 await page.waitForFunction(()=>document.querySelector('#dist .region-projections')?.dataset.ready==='true');
 await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 const state=await page.evaluate(()=>{
  const svg=document.querySelector('#dist .region-time-svg'),box=svg.getBoundingClientRect();
  const sx=svg.viewBox.baseVal.width/box.width,sy=svg.viewBox.baseVal.height/box.height;
  const labels=[...document.querySelectorAll('#dist .region-end-label')].map(node=>{
   const rect=node.getBoundingClientRect();
   return {region:node.dataset.region,shift:getComputedStyle(node).transform,
    x1:(rect.left-box.left)*sx,x2:(rect.right-box.left)*sx,
    y1:(rect.top-box.top)*sy,y2:(rect.bottom-box.top)*sy,
    textRows:[...node.querySelectorAll('.region-end-name,.region-end-count,.region-end-share')].map(part=>{
     const r=part.getBoundingClientRect();return {x1:(r.left-box.left)*sx,x2:(r.right-box.left)*sx,
      y1:(r.top-box.top)*sy,y2:(r.bottom-box.top)*sy};
    })};
  });
  const refs=[...svg.querySelectorAll('.region-measure-reference')].map(node=>({
   level:+node.dataset.level,x:+node.getAttribute('x2'),y:+node.getAttribute('y1'),
   opacity:+getComputedStyle(node).opacity
  })).filter(r=>r.level>0);
  const groups=[...svg.querySelectorAll('.region-projection')].map(node=>({
   level:+node.dataset.level,start:+node.dataset.start,end:+node.dataset.end,y:+node.dataset.y,
   segments:[...node.querySelectorAll('line')].map(l=>({
    a:+l.getAttribute('x1'),b:+l.getAttribute('x2'),
    y1:+l.getAttribute('y1'),y2:+l.getAttribute('y2'),
    opacity:+getComputedStyle(l).opacity,events:getComputedStyle(l).pointerEvents
   }))
  }));
  return {labels,refs,groups,right:+svg.dataset.plotRight,
   labelLayerAboveSvg:svg.compareDocumentPosition(document.querySelector('#dist .region-end-labels'))&Node.DOCUMENT_POSITION_FOLLOWING};
 });
 assert.ok(state.labelLayerAboveSvg,'foreground text must paint above the low-opacity guides');
 assert.deepEqual(state.groups.map(g=>g.level),state.refs.map(r=>r.level),
  'only unique, nonzero cumulative boundaries are projected');
 for(const [i,g] of state.groups.entries()){
  const ref=state.refs[i];
  assert.equal(g.start,ref.x);assert.equal(g.end,state.right);assert.equal(g.y,ref.y);
  assert.equal(g.segments.length,1,'no projection may be chopped into disconnected islands');
  const line=g.segments[0];
  assert.equal(line.a,g.start,'projection starts exactly at its measuring reference');
  assert.equal(line.b,g.end,'projection reaches its genuine plotted endpoint');
  assert.equal(line.y1,g.y);assert.equal(line.y2,g.y);
  assert.ok(line.opacity>0&&line.opacity<ref.opacity,'far projections remain lighter than local measures');
  assert.equal(line.events,'none');
  // No "whole label rectangle" cutout: the guide may safely pass through
  // whitespace between the two text rows, but never through their glyph rows.
  for(const label of state.labels)for(const text of label.textRows){
   const overlapsX=text.x2>g.start+.1&&text.x1<g.end-.1;
   if(overlapsX)assert.ok(g.y<text.y1-.7||g.y>text.y2+.7,
    'unbroken guide must clear visible text, including mobile fonts');
  }
 }
 return state;
}

// Check the complete weight hierarchy, not only line existence.
export async function assertRegionVisualBalance(page){
 const state=await page.evaluate(()=>{
  const all=selector=>[...document.querySelectorAll('#dist '+selector)].map(n=>{const s=getComputedStyle(n);return {region:[...n.closest('.region-series')?.classList||[]].find(k=>['hk','sg','cn'].includes(k)),width:parseFloat(s.strokeWidth),opacity:Number(s.opacity),ink:s.stroke,font:s.fontFamily,size:parseFloat(s.fontSize),weight:s.fontWeight,color:s.color};});
  return {viewport:innerWidth,dark:document.documentElement.dataset.theme==='dark',siteFont:getComputedStyle(document.body).fontFamily,refs:all('.region-measure-reference'),projections:all('.region-projection-line'),arrows:all('.region-measure-height'),tips:all('.region-measure-arrow'),contours:all('.region-spark-line'),names:all('.region-end-name'),counts:all('.region-end-count'),shares:all('.region-end-share')};
 });
 for(const n of state.refs){assert.equal(n.width,.85);assert.equal(n.opacity,.42);}
 for(const n of state.projections){assert.equal(n.width,.85);assert.equal(n.opacity,state.dark?.34:.36);}
 for(const n of state.arrows){
  assert.equal(n.width,.9);assert.equal(n.opacity,state.dark?.51:.56);
  const contour=state.contours.find(c=>c.region===n.region);
  assert.ok(contour,'a dimension must have a matching live contour');
  assert.notEqual(n.ink,contour.ink,'shaft must be quieter and more neutral than the contour');
 }
 for(const n of state.tips){
  assert.equal(n.width,.95);assert.equal(n.opacity,state.dark?.73:.78);
  const contour=state.contours.find(c=>c.region===n.region);
  assert.equal(n.ink,contour?.ink,'color accents must exactly match the regional contour');
 }
 assert.equal(state.arrows.length,state.tips.length,'each live dimension keeps one pair of arrowheads');
 for(const n of state.contours)assert.equal(n.width,1.6,'data contours remain primary');
 for(const [kind,weight] of [['names','500'],['counts','400'],['shares','400']])for(const n of state[kind]){
  assert.equal(n.font,state.siteFont);assert.equal(n.weight,weight);assert.equal(n.opacity,1,'readable text is not faded');
 }
 for(const n of state.counts)assert.equal(n.size,state.viewport<=360?14.5:state.viewport<=720?15:16);
 for(const n of state.names)assert.ok(n.size>=10&&n.size<=10.5);
 for(const n of state.shares)assert.ok(n.size>=9.5&&n.size<=10.5);
 state.legend=await assertRegionLegend(page);
 return state;
}

// The visible legend matches actual contour colors without becoming a control.
export async function assertRegionLegend(page){
 const state=await page.evaluate(()=>{
  const legend=document.querySelector('.region-chart-legend');
  if(!legend)return null;
  const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  const svg=document.querySelector('#dist .region-time-svg'),plot=rect(svg);
  const rgb=hex=>{const match=/^#([0-9a-f]{6})$/i.exec(hex.trim());return match?'rgb('+[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)).join(', ')+')':hex.trim();};
  const items=[...legend.children].map(n=>{
   const k=n.dataset.region.toLowerCase(),swatch=n.querySelector('.region-legend-swatch');
   const fill=document.querySelector('#dist .region-series.'+k+' .region-stack-band');
   const outline=document.querySelector('#dist .region-series.'+k+' .region-spark-line');
   const palette=getComputedStyle(document.querySelector('#dist .region-series.'+k+'.region-fill'));
   const style=getComputedStyle(swatch),text=getComputedStyle(n),r=swatch.getBoundingClientRect();
   return {region:n.dataset.region,text:n.textContent.trim(),box:rect(n),color:style.backgroundColor,
    count:Number(svg.getAttribute('data-region-'+k)),hasBand:!!fill,hasOutline:!!outline,
    borders:['Top','Right','Bottom','Left'].map(side=>parseFloat(style['border'+side+'Width'])),opacity:Number(style.opacity),
    expectedInk:outline?getComputedStyle(outline).stroke:rgb(palette.getPropertyValue('--region-ink')),font:text.fontFamily,
    weight:text.fontWeight,size:parseFloat(text.fontSize),swatchWidth:r.width,swatchHeight:r.height};
  });
  return {count:document.querySelectorAll('.region-chart-legend').length,
   followsTitle:legend.previousElementSibling?.id==='distTitle',precedesPlot:legend.nextElementSibling?.id==='dist',
   title:rect(document.querySelector('#distTitle')),box:rect(legend),plot,
   endpoint:plot.left+(plot.right-plot.left)*Number(svg.dataset.plotRight)/svg.viewBox.baseVal.width,
   items,controls:legend.querySelectorAll('button,a,input,[role="button"],[tabindex]').length,
   listRole:legend.getAttribute('role'),siteFont:getComputedStyle(document.body).fontFamily,
   scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 assert.ok(state,'region legend is present');assert.equal(state.count,1);
 assert.equal(state.followsTitle,true);assert.equal(state.precedesPlot,true);
 assert.equal(state.listRole,'list');assert.equal(state.controls,0);
 assert.deepEqual(state.items.map(n=>n.region),['HK','SG','CN']);
 assert.deepEqual(state.items.map(n=>n.text),['Hong Kong','Singapore','Mainland China']);
 assert.ok(state.box.top>=state.title.bottom+5,'legend sits on the next row below title');
 assert.ok(state.plot.top>=state.box.bottom+7,'legend does not overlap the plot');
 assert.ok(Math.abs(state.items.at(-1).box.right-state.endpoint)<1,'legend is right-aligned to plot endpoint');
 for(const item of state.items){
  assert.equal(item.hasBand,item.count>0,'only nonzero regions have an actual band');
  assert.equal(item.hasOutline,item.count>0,'only nonzero regions have an outline');
  assert.equal(item.color,item.expectedInk,'legend line must match its actual region contour in this theme');
  assert.ok(item.borders.every(width=>width===0),'legend lines have no border');
  assert.equal(item.opacity,1,'legend lines preserve the full contour color');
  assert.equal(item.font,state.siteFont);assert.equal(item.weight,'400');
  assert.ok(item.size>=10&&item.size<=10.5);
  assert.ok(item.swatchWidth>=12&&item.swatchWidth<=20&&item.swatchHeight>=3&&item.swatchHeight<=4&&item.swatchWidth>=item.swatchHeight*4,'legend marks are short, thick horizontal lines');
  assert.ok(Math.abs(item.box.top-state.items[0].box.top)<1,'all regions fit on one line');
  assert.ok(item.box.left>=state.plot.left&&item.box.right<=state.plot.right+1);
 }
 assert.ok(state.scrollWidth<=state.viewport+2,'legend does not cause horizontal overflow');
 return state;
}
