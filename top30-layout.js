/* Responsive Top 30 layout: fitted robust scale.  Both axes are zoomed to the
   data's own span so the cluster fills the frame, while one stale listing
   (notably Citi in CN) is pinned to a marked edge instead of stretching the
   scale and crushing every other bubble into one corner. */
(() => {
  const renderTop30Relaxed = (rows, mode = 'all') => {
    const host = document.getElementById('top50');
    if (!host) return;
    const now = Date.now();
    const scoped = (mode === 'all' ? rows : rows.filter(j => norm(j.location) === mode)).filter(isActiveJob);
    const counts = new Map();
    scoped.forEach(job => {
      const name = canonicalCompany(job.company || '未知机构') || '未知机构';
      if (!name) return;
      if (!counts.has(name)) counts.set(name, {total: 0, ages: []});
      const item = counts.get(name); item.total += 1;
      const seen = Date.parse(job.firstSeen || '');
      if (Number.isFinite(seen)) item.ages.push(Math.max(0, (now - seen) / 86400000));
    });
    const top = [...counts.entries()].filter(([,d]) => d.ages.length).sort((a,b) => b[1].total-a[1].total || a[0].localeCompare(b[0],'zh-Hans-CN')).slice(0,30);
    const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const companyLabel=name=>{const short=String(name||'').trim().split(/\s+/).slice(0,6).join(' ');const chars=[...short];let w=0,out='';for(const ch of chars){const cw=ch.charCodeAt(0)>255?7.5:4.45;if(w+cw>108)return out+'…';w+=cw;out+=ch;}return out;};
    const W=820,H=620,left=58,plotRight=762,plotTop=36,plotBottom=570;
    const values=top.map(([,d])=>{const ages=[...d.ages].sort((a,b)=>a-b),n=ages.length;return {mean:ages.reduce((a,b)=>a+b,0)/n,median:n%2?ages[(n-1)/2]:(ages[n/2-1]+ages[n/2])/2};});
    const sortedValues=values.flatMap(v=>[v.mean,v.median]).sort((a,b)=>a-b);
    if(!sortedValues.length){host.classList.remove('is-ready');host.innerHTML='';return;}
    /* Linear-interpolated percentile.  The delta must stay inside its own
       parens: `a ?? b - c` would parse as `a ?? (b - c)` and silently break
       every quantile derived from it. */
    const percentile=(vals,p)=>{const k=(vals.length-1)*p,i=Math.min(vals.length-1,Math.floor(k)),f=k-i,a=vals[i],b=vals[Math.min(vals.length-1,i+1)];return a+(b-a)*f;};
    /* Fit both axes to the data's own span.  Every listing ages day by day, so
       a zero origin eventually pushes the whole cloud into one corner; a fitted
       domain keeps the plot full.  The upper cap is robust (Tukey fence) so a
       single stale outlier cannot stretch the scale again — values past the cap
       are pinned to the frame edge and flagged in the corner note. */
    const q1=percentile(sortedValues,.25),q3=percentile(sortedValues,.75);
    const fence=q3+1.5*Math.max(4,q3-q1);
    const inliers=sortedValues.filter(v=>v<=fence);
    const fit=inliers.length?inliers:sortedValues;
    const dataMax=Math.max(...fit),dataMin=Math.min(...sortedValues);
    const span=Math.max(1,dataMax-dataMin),tickStep=span<=36?5:span<=90?10:20;
    const domainMin=Math.max(0,Math.floor((dataMin-span*.04)/tickStep)*tickStep);
    const domainMax=Math.ceil((dataMax+span*.04)/tickStep)*tickStep;
    const scale=domainMax-domainMin||1;
    /* unit() saturates at the edge: outliers land exactly on the frame, which
       reads as "runs off the chart" and keeps them out of the cluster. */
    const unit=value=>Math.min(1,Math.max(0,(Number(value)||0)-domainMin)/scale);
    const x=v=>left+(plotRight-left)*unit(v),y=v=>plotBottom-(plotBottom-plotTop)*unit(v);
    const ticks=[];for(let i=0;domainMin+i*tickStep<=domainMax+1e-9;i++)ticks.push(domainMin+i*tickStep);
    const grid=ticks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+x(v).toFixed(1)+'" y1="'+plotTop+'" x2="'+x(v).toFixed(1)+'" y2="'+plotBottom+'"/>')+'<text class="bubble-axis" x="'+x(v).toFixed(1)+'" y="'+(plotBottom+17)+'" text-anchor="middle">'+Math.round(v)+'</text>').join('')+ticks.map(v=>(v===domainMax?'':'<line class="bubble-grid" x1="'+left+'" y1="'+y(v).toFixed(1)+'" x2="'+plotRight+'" y2="'+y(v).toFixed(1)+'"/>')+'<text class="bubble-axis" x="'+(left-10)+'" y="'+(y(v)+3).toFixed(1)+'" text-anchor="end">'+Math.round(v)+'</text>').join('');
    const clippedHigh=sortedValues[sortedValues.length-1]>domainMax+1e-6;
    const scaleNote='<text class="bubble-outlier-note" x="'+(plotRight-2)+'" y="'+(plotTop-10)+'" text-anchor="end">SCALE FITTED TO DATA RANGE'+(clippedHigh?' · OUTLIERS CLIPPED':'')+'</text>';
    const palette=['#F5572F','#D4A017','#ACAD79','#7096D1','#334EAC','#081F5C'],maxTotal=Math.max(1,...top.map(([,d])=>d.total));
    const points=top.map(([name,item],i)=>{const ages=[...item.ages].sort((a,b)=>a-b),n=ages.length,mean=ages.reduce((a,b)=>a+b,0)/n,median=n%2?ages[(n-1)/2]:(ages[n/2-1]+ages[n/2])/2,r=3+Math.sqrt(item.total/maxTotal)*6.4,rawX=x(mean),rawY=y(median);return {name,item,i,mean,median,r,rawX,rawY,px:rawX,py:rawY,color:palette[Math.min(5,Math.floor(i/5))],label:companyLabel(name)};});
    for(let pass=0;pass<180;pass++){
      for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const a=points[i],b=points[j],dx=b.px-a.px,dy=b.py-a.py;let dist=Math.hypot(dx,dy),min=a.r+b.r+6.5;if(dist>=min)continue;if(dist<.01){const angle=((i+1)*37+(j+1)*61)*Math.PI/180;b.px+=Math.cos(angle);b.py+=Math.sin(angle);dist=1;}const push=(min-dist)*.5,ux=(b.px-a.px)/dist,uy=(b.py-a.py)/dist;a.px-=ux*push;a.py-=uy*push;b.px+=ux*push;b.py+=uy*push;}
      points.forEach(p=>{p.px+=(p.rawX-p.px)*.035;p.py+=(p.rawY-p.py)*.035;const maxShift=72,dx=p.px-p.rawX,dy=p.py-p.rawY,d=Math.hypot(dx,dy);if(d>maxShift){p.px=p.rawX+dx/d*maxShift;p.py=p.rawY+dy/d*maxShift;}p.px=Math.max(left+p.r,Math.min(plotRight-p.r,p.px));p.py=Math.max(plotTop+p.r,Math.min(plotBottom-p.r,p.py));});
    }
    const occupied=[],overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,labelWidth=s=>[...String(s||'')].reduce((w,ch)=>w+(ch.charCodeAt(0)>255?7.5:4.45),0);
    /* Labels fan out perpendicular to the diagonal: a bubble above the line
       (median > mean) labels into the upper-left triangle, a bubble below it
       into the lower-right triangle.  This keeps labels out of the dense band
       and out of each other's way. */
    const placeLabel=p=>{const w=labelWidth(p.label),unitX=(p.rawX-left)/(plotRight-left),unitY=(plotBottom-p.rawY)/(plotBottom-plotTop),above=unitY>unitX,sideCost=above?{left:0,above:1,right:2,below:3}:{right:0,below:1,left:2,above:3},candidates=[],shifts=[0,-5.5,5.5,-11,11,-16.5,16.5,-22,22,-27.5,27.5,-33,33,-44,44,-55,55,-66,66];for(const shift of shifts)for(const side of ['right','left','below','above']){let lx,ly,anchor;if(side==='right'){lx=p.px+p.r+7;ly=p.py+shift;anchor='start';}else if(side==='left'){lx=p.px-p.r-7;ly=p.py+shift;anchor='end';}else if(side==='below'){lx=p.px+shift;ly=p.py+p.r+13;anchor='middle';}else{lx=p.px+shift;ly=p.py-p.r-10;anchor='middle';}const bx=anchor==='start'?lx:anchor==='end'?lx-w:lx-w/2,box={x:bx,y:ly-6,w,h:11};if(box.x<left+2||box.x+box.w>plotRight-2||box.y<plotTop||box.y+box.h>plotBottom)continue;const collisions=occupied.filter(o=>overlaps(box,o)).length;candidates.push({lx,ly,anchor,box,cost:collisions*10000+sideCost[side]*60+Math.abs(shift)*4});}const best=candidates.sort((a,b)=>a.cost-b.cost)[0]||{lx:p.px+p.r+7,ly:p.py,anchor:'start',box:{x:p.px+p.r+7,y:p.py-6,w,h:11}};p.labelBox=best;occupied.push(best.box);};
    [...points].sort((a,b)=>a.py-b.py).forEach(placeLabel);
    /* Repair rounds: re-place only the worst offender at a time, and keep the
       move only when it strictly reduces collisions.  Monotone by design —
       the result cannot flap between near-equivalent layouts. */
    const collisionCount=p=>p.labelBox?points.filter(q=>q!==p&&q.labelBox&&overlaps(p.labelBox.box,q.labelBox.box)).length:0;
    for(let round=0;round<6;round++){
      const bad=points.filter(p=>collisionCount(p)>0).sort((a,b)=>collisionCount(b)-collisionCount(a));
      if(!bad.length)break;
      let moved=false;
      for(const p of bad){
        const before=collisionCount(p);
        if(before<=0)continue;
        const old=p.labelBox,oldIdx=occupied.indexOf(old.box);
        if(oldIdx>=0)occupied.splice(oldIdx,1);
        placeLabel(p);
        if(collisionCount(p)>=before){const ni=occupied.indexOf(p.labelBox.box);if(ni>=0)occupied.splice(ni,1);p.labelBox=old;occupied.push(old.box);}
        else moved=true;
      }
      if(!moved)break;
    }
    const pointMarkup=points.map(p=>{const deep=p.i>=20,ink=deep?'#F0EFEB':'#1C1C1A',displaced=Math.hypot(p.px-p.rawX,p.py-p.rawY)>2.5,positionLeader=displaced?'<line class="bubble-position-leader" x1="'+p.rawX.toFixed(1)+'" y1="'+p.rawY.toFixed(1)+'" x2="'+p.px.toFixed(1)+'" y2="'+p.py.toFixed(1)+'"/>':'',b=p.labelBox,w=labelWidth(p.label),labelLeft=b.anchor==='start'?b.lx:b.anchor==='end'?b.lx-w:b.lx-w/2,labelLeader='<line class="bubble-label-leader" x1="'+p.px.toFixed(1)+'" y1="'+p.py.toFixed(1)+'" x2="'+(b.anchor==='start'?b.lx-2:b.anchor==='end'?b.lx+2:b.lx).toFixed(1)+'" y2="'+b.ly.toFixed(1)+'"/>',title=escSvg(p.name)+' · '+p.item.total+' 个职位 · 平均 '+p.mean.toFixed(1)+' 天 · 中位 '+p.median.toFixed(1)+' 天';return '<g class="bubble-row bubble-drill" data-company="'+escSvg(p.name)+'" style="--i:'+p.i+'" role="button" tabindex="0">'+positionLeader+labelLeader+'<rect class="bubble-hit" x="'+(labelLeft-2).toFixed(1)+'" y="'+(b.ly-7).toFixed(1)+'" width="'+(w+4).toFixed(1)+'" height="11" rx="2"/><circle class="bubble-point" cx="'+p.px.toFixed(1)+'" cy="'+p.py.toFixed(1)+'" r="'+p.r.toFixed(1)+'" fill="'+p.color+'"><title>'+title+'</title></circle><text class="bubble-company" x="'+b.lx.toFixed(1)+'" y="'+b.ly.toFixed(1)+'" text-anchor="'+b.anchor+'">'+escSvg(p.label)+'</text><text class="bubble-total'+(deep?' bubble-total-deep':'')+'" fill="'+ink+'" x="'+p.px.toFixed(1)+'" y="'+(p.py+2.5).toFixed(1)+'" text-anchor="middle">'+p.item.total+'</text></g>';}).join('');
    const diagonal='<line class="bubble-diagonal" x1="'+x(domainMin)+'" y1="'+y(domainMin)+'" x2="'+x(domainMax)+'" y2="'+y(domainMax)+'"/>';
    host.classList.remove('is-ready');host.innerHTML='<svg class="top20-svg bubble-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Top 30 机构平均首次发现天数、中位数与职位数量气泡图">'+grid+scaleNote+diagonal+'<text class="bubble-x-title" x="'+((left+plotRight)/2)+'" y="'+(H-2)+'" text-anchor="middle">AVG DAYS SINCE FIRST SEEN</text><text class="bubble-y-title" x="31" y="'+((plotTop+plotBottom)/2)+'" text-anchor="middle" transform="rotate(-90 31 '+((plotTop+plotBottom)/2)+')">MEDIAN DAYS</text>'+pointMarkup+'</svg>';requestAnimationFrame(()=>host.classList.add('is-ready'));
  };
  renderTop50=renderTop30Relaxed;
})();
