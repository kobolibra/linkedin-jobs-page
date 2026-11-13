from pathlib import Path
import hashlib

root=Path('.')
for name,expected in {'app.js':'9534b91912697e8173556a6bf39cf90164eb4fd72dc4fdfa2a8384b08eaf058e','styles-refinement.css':'35b151b7825adf1b4664fec4f56d668973e4336609cbb2d23c9af7cb5880b4c3'}.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==expected,name
p=root/'app.js';s=p.read_text()
old="      series.map(layer=>layer.outline).join('')+dateTicks+'</svg>'+"
assert s.count(old)==1
s=s.replace(old,"      '<g class=\"region-projections\" aria-hidden=\"true\" pointer-events=\"none\"></g>'+\n"+old,1)
anchor="      directLabels+'</div>';"
assert s.count(anchor)==1
s=s.replace(anchor,anchor+'''
    // Project only the nonzero final boundaries to their actual right endpoints.
    // Read real HTML label boxes before writing SVG segments: no background
    // knockouts, guessed text widths, moved labels, or changes to data geometry.
    distEl._regionProjectionCleanup?.();
    const projectionSvg=distEl.querySelector('.region-time-svg');
    const projectionLayer=projectionSvg.querySelector('.region-projections');
    let projectionFrame=0,projectionDisposed=false,projectionMarkup='';
    const updateRegionProjections=()=>{
      projectionFrame=0;
      if(projectionDisposed||!projectionSvg.isConnected)return;
      const box=projectionSvg.getBoundingClientRect();
      if(!box.width||!box.height)return;
      const scaleX=TW/box.width,scaleY=TH/box.height;
      const exclusions=[...distEl.querySelectorAll('.region-end-label')].map(node=>{
        const r=node.getBoundingClientRect();
        return {x1:(r.left-box.left-6)*scaleX,x2:(r.right-box.left+6)*scaleX,
          y1:(r.top-box.top-4)*scaleY,y2:(r.bottom-box.top+4)*scaleY};
      });
      const markup=[...projectionSvg.querySelectorAll('.region-measure-reference')]
        .filter(node=>Number(node.dataset.level)>0).map(node=>{
          const level=Number(node.dataset.level),y=Number(node.getAttribute('y1'));
          const start=Number(node.getAttribute('x2')),end=TW-right;
          let segments=[[start,end]];
          for(const gap of exclusions){
            if(y<gap.y1||y>gap.y2)continue;
            segments=segments.flatMap(([a,b])=>gap.x2<=a||gap.x1>=b?[[a,b]]:
              [[a,Math.min(b,gap.x1)],[Math.max(a,gap.x2),b]].filter(([x1,x2])=>x2>x1));
          }
          return '<g class="region-projection" data-level="'+level+
            '" data-start="'+start+'" data-end="'+end+'" data-y="'+y+'">'+
            segments.filter(([a,b])=>b>a).map(([a,b])=>
              '<line class="region-projection-line" x1="'+a.toFixed(3)+'" x2="'+b.toFixed(3)+
              '" y1="'+y+'" y2="'+y+'"/>').join('')+'</g>';
        }).join('');
      if(markup!==projectionMarkup){projectionLayer.innerHTML=markup;projectionMarkup=markup;}
      projectionLayer.dataset.ready='true';
    };
    const scheduleRegionProjections=()=>{
      if(!projectionDisposed&&!projectionFrame)projectionFrame=requestAnimationFrame(updateRegionProjections);
    };
    // Recompute gaps for rotation, responsive layout and late font loading.
    // A rerender disconnects the previous observer; lines never own interaction.
    const projectionObserver=typeof ResizeObserver==='function'
      ?new ResizeObserver(scheduleRegionProjections):null;
    projectionObserver?.observe(projectionSvg);
    distEl.querySelectorAll('.region-end-label').forEach(node=>projectionObserver?.observe(node));
    if(!projectionObserver)window.addEventListener('resize',scheduleRegionProjections);
    document.fonts?.ready.then(scheduleRegionProjections);
    distEl._regionProjectionCleanup=()=>{
      projectionDisposed=true;cancelAnimationFrame(projectionFrame);
      projectionObserver?.disconnect();
      window.removeEventListener('resize',scheduleRegionProjections);
    };
    updateRegionProjections();''',1)
p.write_text(s)
p=root/'styles-refinement.css';s=p.read_text();anchor='#dist .region-measure-height{';assert s.count(anchor)==1
s=s.replace(anchor,'''/* Far projections are subordinate to local measures, values and contours. */
#dist .region-projection-line{
  stroke:var(--viz-secondary);stroke-width:.75;stroke-dasharray:1.3 4;
  opacity:.2;fill:none;vector-effect:non-scaling-stroke;pointer-events:none;
}
[data-theme="dark"] #dist .region-projection-line{opacity:.22}
'''+anchor,1);p.write_text(s)
for name in ['index.html','scripts/test_frontend_resilience.mjs']:
    p=root/name;s=p.read_text();assert 'region-type-clean-20261113' in s;p.write_text(s.replace('region-type-clean-20261113','region-projection-20261113'))
p=root/'scripts/test_calendar_browser.mjs';s=p.read_text();s="import {assertRegionProjections} from './assert_region_projections.mjs';\n"+s
assert "  const state=await page.evaluate(()=>{" in s
s=s.replace("  const state=await page.evaluate(()=>{","  const projections=await assertRegionProjections(page);\n  const state=await page.evaluate(()=>{",1)
old='results.push({engine,width,theme,state,typography:type,errors});await page.close();';assert old in s
s=s.replace(old,'''results.push({engine,width,theme,state,typography:type,projections,errors});
  // Text must stay unobstructed after rotation and a late change in font metrics.
  if(width===390){
   await page.setViewportSize({width:320,height:1000});await assertRegionProjections(page);
   await page.addStyleTag({content:'#dist .region-end-label{letter-spacing:.15em} #dist .region-end-count{font-size:20px}'});
   await assertRegionProjections(page);
  }
  await page.close();''')
p.write_text(s)
p=root/'scripts/test_homepage_startup.mjs';s=p.read_text();s="import {assertRegionProjections} from './assert_region_projections.mjs';\n"+s
old='   assert.equal(state.ready,true);assert.equal(state.empty,false);';assert old in s
s=s.replace(old,'   await assertRegionProjections(page);\n'+old,1);p.write_text(s)
p=root/'.github/workflows/homepage-startup.yml';s=p.read_text();anchor="      - 'scripts/test_calendar_browser.mjs'";assert s.count(anchor)==2
p.write_text(s.replace(anchor,anchor+"\n      - 'scripts/assert_region_projections.mjs'"))
print('Only projection rendering/styles, cache references and regression coverage changed.')
