from pathlib import Path
import hashlib
root=Path('.')
p=root/'app.js';s=p.read_text()
assert hashlib.sha1(b'blob '+str(len(p.read_bytes())).encode()+b'\0'+p.read_bytes()).hexdigest()=='e44ae721ef30cad60423b64ba5a289fa0cba3c1f'
a=s.index('    const regionTickFormat=new Intl.DateTimeFormat(')
b=s.index('    // Snapshot counts and share labels',a)
s=s[:a]+'''    const regionTickFormat=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
    // This Date-only chart helper must NEVER shadow the ISO-safe list dayLabel.
    const regionAxisDayLabel=(date)=>regionTickFormat.format(date);
    const yearLabel=date=>date.getUTCFullYear().toString();
    const axisCssWidth=distEl.getBoundingClientRect().width||TW;
    const firstDate=new Date(tMin),lastDate=new Date(tMax-dayMs);
    // Calendar ticks describe a REGULAR cadence, not the two arbitrary data
    // endpoints. Exact observed bounds are disclosed separately below the axis.
    const calendarCandidates=[];
    const calendarMode=bins>180?'quarter':bins>56?'month':bins>7?'week':'day';
    const calendarStep=calendarMode==='quarter'?(bins>730?12:bins>365?6:3):calendarMode==='week'
      ?(7/(bins-1)*plotW*axisCssWidth/TW>=43?7:14)
      :calendarMode==='day'?Math.max(1,Math.ceil(bins/5),Math.ceil(40*Math.max(1,bins-1)/(plotW*axisCssWidth/TW))):1;
    const monthFormat=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'});
    for(let day=0;day<bins;day++){
      const date=new Date(tMin+day*dayMs),serial=Math.floor(date.getTime()/dayMs);
      const month=date.getUTCMonth();
      const include=calendarMode==='quarter'||calendarMode==='month'
        ?date.getUTCDate()===1&&month%calendarStep===0
        :calendarMode==='week'?(serial-4)%calendarStep===0
        :day%calendarStep===0;
      if(!include)continue;
      calendarCandidates.push({day,date:date.toISOString().slice(0,10),label:
        calendarMode==='quarter'||calendarMode==='month'?monthFormat.format(date):regionAxisDayLabel(date)});
    }
    const dateTicks=calendarCandidates.map(item=>{
      const x=trendX(item.day+1),anchor=x-left<24?'start':TW-right-x<24?'end':'middle';
      return '<line class="region-date-tick" x1="'+x.toFixed(2)+'" x2="'+x.toFixed(2)+'" y1="333" y2="337"/>'+
        '<text class="region-spark-date" x="'+x.toFixed(2)+
        '" y="351" data-day="'+item.day+'" data-date="'+item.date+'" text-anchor="'+anchor+'">'+
        escSvg(item.label)+'</text>';
    }).join('');
    const regionRangeStart=regionAxisDayLabel(firstDate)+(firstDate.getUTCFullYear()!==lastDate.getUTCFullYear()?' '+yearLabel(firstDate):'');
    const regionRangeEnd=regionAxisDayLabel(lastDate)+' '+yearLabel(lastDate);
    const regionRange='<div class="chart-date-range" data-calendar="utc" aria-label="Observed date range, UTC">'+
      '<span>'+(bins===1?regionRangeEnd:regionRangeStart+' &ndash; '+regionRangeEnd)+'</span><span class="chart-date-zone">UTC</span></div>';
''' +s[b:]
a=s.index('    const referenceLines=[...new Set(cumulativeLevels)]')
b=s.index('    const verticalMeasures=regionOrder.map',a)
s=s[:a]+'''    // Each arrow and its label advance together by 66 SVG units. Shared
    // boundary references connect adjacent measures, creating a true staircase.
    const measureX={HK:88,SG:154,CN:220};
    const referenceLines=[...new Set(cumulativeLevels)].map(level=>{
      const adjacent=regionOrder.filter((k,i)=>snapshotCounts[i]>0&&
        (cumulativeLevels[i]===level||cumulativeLevels[i+1]===level)).map(k=>measureX[k]);
      if(!adjacent.length)return '';
      return '<line class="region-measure-reference" data-level="'+level+
        '" x1="'+(Math.min(...adjacent)-10)+'" x2="'+(Math.max(...adjacent)+14)+
        '" y1="'+trendY(level).toFixed(2)+'" y2="'+trendY(level).toFixed(2)+'"/>';
    }).join('');
''' +s[b:]
s=s.replace('      const x=106+i*10;','      const x=measureX[k];')
a=s.index('      // For an almost-zero share, preserve the exact tiny length')
b=s.index('      return \'<g class="region-series',a)
s=s[:a]+'''      // Open arrow tips touch the actual boundaries; no exaggerated lengths.
      // Keep arrowheads legible in CSS pixels, and omit them for very thin bands.
      const wing=2.4*TW/axisCssWidth,depth=3.8*TW/axisCssWidth;
      const arrowheads=low-high>=depth*2+4
        ?'<path class="region-measure-arrow" d="M'+(x-wing).toFixed(2)+','+(high+depth).toFixed(2)+
          ' L'+x+','+high.toFixed(2)+' L'+(x+wing).toFixed(2)+','+(high+depth).toFixed(2)+
          ' M'+(x-wing).toFixed(2)+','+(low-depth).toFixed(2)+
          ' L'+x+','+low.toFixed(2)+' L'+(x+wing).toFixed(2)+','+(low-depth).toFixed(2)+'"/>':'';
''' +s[b:]
s=s.replace('    const labelX={HK:139,SG:153,CN:167};','    const labelX=Object.fromEntries(regionOrder.map(k=>[k,measureX[k]+16*TW/axisCssWidth]));')
s=s.replace("      directLabels+'</div>';","      directLabels+'</div>'+regionRange;")
s=s.replace("      '\" data-axis-max=\"'+regionMax+", "      '\" data-plot-right=\"'+(TW-right)+'\" data-calendar-mode=\"'+calendarMode+'\" data-calendar-step=\"'+calendarStep+\n      '\" data-axis-max=\"'+regionMax+")
a=s.index('    // Monday-based, calendar-anchored marks.')
b=s.index('    const sparkEl=document.getElementById("spark");',a)
s=s[:a]+'''    // A 30-day window always uses real Mondays, seven days apart. Do not
    // inject arbitrary endpoints or silently drop weeks to fit endpoint text.
    const rhythmTickFormat=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'});
    const rhythmMarks=days.map((d,i)=>d.date.getDay()===1?i:-1).filter(i=>i>=0);
    const dateLabels=rhythmMarks.map(i=>{
      const x=sx(i),anchor=x-sLeft<24?'start':SW-sRight-x<24?'end':'middle';
      return '<line class="rhythm-date-tick" x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="130" y2="134"/>'+
        '<text class="rhythm-axis-label" x="'+x.toFixed(1)+
        '" y="145" data-day="'+i+'" data-date="'+keyOf(days[i].date)+'" text-anchor="'+anchor+'">'+
        rhythmTickFormat.format(days[i].date)+'</text>';
    }).join('');
    const rhythmFirst=days[0].date,rhythmLast=days[days.length-1].date;
    const rhythmRangeStart=rhythmTickFormat.format(rhythmFirst)+(rhythmFirst.getFullYear()!==rhythmLast.getFullYear()?' '+rhythmFirst.getFullYear():'');
    const rhythmRangeEnd=rhythmTickFormat.format(rhythmLast)+' '+rhythmLast.getFullYear();
    const rhythmRange='<div class="chart-date-range" data-calendar="local" aria-label="Rolling 30-day range in local calendar days">'+
      '<span>'+rhythmRangeStart+' &ndash; '+rhythmRangeEnd+'</span><span class="chart-date-zone">Local</span></div>';
''' +s[b:]
s=s.replace("      guides+bars+dateLabels+'</svg>';","      guides+bars+dateLabels+'</svg>'+rhythmRange;")
p.write_text(s)
for filename in ['index.html','scripts/test_frontend_resilience.mjs']:
 p=root/filename;s=p.read_text().replace('list-date-shadow-fix-20261113','calendar-staircase-20261113').replace('regional-measures-20261113','calendar-staircase-20261113');p.write_text(s)
p=root/'styles-refinement.css';s=p.read_text()
s=s.replace('stroke-dasharray:1.5 4.5;\n  opacity:.43','stroke-dasharray:1.3 4;\n  opacity:.34')
s=s.replace('position:absolute;left:27.7%;transform:translateY(-50%);','position:absolute;transform:translateY(-50%);')
s=s.replace('  #dist .region-end-count{font-size:13.5px}','  #dist .region-end-count{font-size:14px}')
s+='''
/* Calendar labels share one typographic grammar; bounds are not axis ticks. */
#dist .region-spark-date,#spark .rhythm-axis-label,
[data-theme="dark"] #spark .rhythm-axis-label{
  fill:var(--viz-secondary);font:500 12px var(--mono);letter-spacing:0;
  font-variant-numeric:tabular-nums;
}
#dist .chart-date-range,#spark .chart-date-range{
  display:flex;justify-content:space-between;gap:12px;margin-top:3px;
  color:var(--viz-quiet);font:500 10px/1.5 var(--mono);letter-spacing:0;
  font-variant-numeric:tabular-nums;
}
#dist .chart-date-range{padding-left:8.269%;padding-right:3.269%}
#spark .chart-date-range{padding-left:6.346%;padding-right:3.269%}
.chart-date-zone{opacity:.78}
@media(max-width:720px){
  #dist .region-spark-date,#spark .rhythm-axis-label,
  [data-theme="dark"] #spark .rhythm-axis-label{font-size:16px}
  #dist .chart-date-range,#spark .chart-date-range{font-size:9px}
}
''';p.write_text(s)
p=root/'scripts/test_frontend_resilience.mjs';s=p.read_text()
s=s.replace(r'/const labelX=\{HK:139,SG:153,CN:167\}/',r'/const measureX=\{HK:88,SG:154,CN:220\}/')
s=s.replace(r'/const regionalGap=66\*TW\/axisCssWidth/',r'/const calendarMode=bins>180/')
s=s.replace(r'/const rhythmMarks=\[0\]/',r'/const rhythmMarks=days\.map/')
s=s.replace(r'/days\[i\]\.date\.getDay\(\)!==1/',r'/d\.date\.getDay\(\)===1/')
p.write_text(s)
p=root/'scripts/test_market_width_browser.mjs';s=p.read_text()
s=s.replace("plotRight:Number(endDate?.getAttribute('x')),","plotRight:Number(svg.dataset.plotRight),\n   calendarMode:svg.dataset.calendarMode,calendarStep:Number(svg.dataset.calendarStep),\n   ranges:[...document.querySelectorAll('.chart-date-range')].map(n=>n.textContent),")
s=s.replace("day:Number(node.dataset.day),label:node.textContent,bounds:rect(node)","day:Number(node.dataset.day),date:node.dataset.date,label:node.textContent,bounds:rect(node)")
s=s.replace('quality.svgBounds.w*.24','quality.svgBounds.w*.18').replace('quality.svgBounds.w*.76','quality.svgBounds.w*.86')
s=s.replace("assert.equal(span.x1,106+i*10,", "assert.equal(span.x1,88+i*66,")
a=s.index(' assert.equal(quality.regionDateMarks[0].day,0);');b=s.index(' const checkScale=',a)
s=s[:a]+''' assert.equal(quality.ranges.length,2,'both exact date ranges are disclosed outside the regular axes');
 assert.ok(quality.postingDateMarks.every(m=>m.weekday===1),'every New Postings tick is Monday');
 for(let i=1;i<quality.postingDateMarks.length;i++)assert.equal(quality.postingDateMarks[i].day-quality.postingDateMarks[i-1].day,7,'no skipped or invented week');
 if(['quarter','month'].includes(quality.calendarMode)){
  const months=quality.regionDateMarks.map(m=>{const d=new Date(m.date+'T00:00:00Z');assert.equal(d.getUTCDate(),1);return d.getUTCFullYear()*12+d.getUTCMonth();});
  for(let i=1;i<months.length;i++)assert.equal(months[i]-months[i-1],quality.calendarStep,'month cadence is fixed');
 }
 for(let i=1;i<quality.legendItems.length;i++){
  const previous=quality.legendItems[i-1],current=quality.legendItems[i];
  assert.ok(current.bounds.x-previous.bounds.x>=quality.svgBounds.w*65/520,'labels visibly progress rightward with their arrows');
  assert.ok(current.bounds.y<previous.bounds.y,'regional readings ascend along the actual stack');
 }
''' +s[b:]
s=s.replace("assert.equal(quality.shortHistory,quality.dayBins<100,\n  'only genuinely short observation windows use the tight two-line knockout layout');","assert.equal(quality.shortHistory,quality.dayBins<100);")
s=s.replace("assert.equal(tomorrowTicks.at(-1),'Nov 13','the rightmost chart date advances with the data');", "assert.deepEqual(tomorrowTicks,['Apr','Jul','Oct'],'regular quarters do not change to arbitrary endpoints');\n assert.match(await tomorrowPage.locator('#dist .chart-date-range').textContent(),/13 Nov 2026/,'the exact range advances with the newly published data');")
s=s.replace('quality.dateTicks<=5','quality.dateTicks<=6').replace('level.x2-level.x1<=146.1','level.x2-level.x1<=156.1')
p.write_text(s)
p=root/'scripts/test_homepage_startup.mjs'
s=p.read_text().replace("assert.equal((part.match(/regionAxisDayLabel/g)||[]).length,4);","assert.ok(part.includes('const regionAxisDayLabel='));")
s=s.replace("const end=text.indexOf('    const calendarCandidates=[];',start);","const end=text.indexOf('    // Snapshot counts and share labels',start);")
p.write_text(s)
expected={'app.js':'1b9ed4a08ea384b3ae67b4c0f28c3224a01eff9adef4d8c8d0ee3151b25946cb','index.html':'db6f7c30b18ce919a3a615ea3023ee0ab962d3997fc36c8239d0e49f0ff6e894','styles-refinement.css':'2c43a2774f07f37477cdc770debf1855b8aa5eb55ec4745c6b9dd1018313b184','scripts/test_frontend_resilience.mjs':'945657c54935f4ac003b897e044c433a88cc2b78519debb06934c1402e9f1988','scripts/test_market_width_browser.mjs':'ea2ab4952ca24d3360249d156fcc457628e25f3752a4af14f6b266ea6418c674'}
for name,sha in expected.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==sha, 'Local-tested byte mismatch: '+name
print('All edited production files match locally tested bytes')
