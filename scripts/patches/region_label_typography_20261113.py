from pathlib import Path
import hashlib
import re


def replace_once(text, before, after):
    assert text.count(before) == 1, f'Expected one occurrence: {before!r}'
    return text.replace(before, after, 1)


def remove_span(text, start, end):
    a = text.index(start)
    b = text.index(end, a)
    assert b > a
    return text[:a] + text[b:]


before_dir = Path('artifacts/region-type-before')
before_dir.mkdir(parents=True, exist_ok=True)
for name, expected in [('app.js', 'a97b3474a804749a6a786418986b0bc93a69b52a'), ('styles-refinement.css', '59a4a87e4c1e91f45e74d30e1845e258da6bf176')]:
    data = Path(name).read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert actual == expected, f'Unexpected base {name}: {actual}'
    (before_dir / name).write_bytes(data)
(before_dir / 'index.html').write_bytes(Path('index.html').read_bytes())

p = Path('app.js')
s = p.read_text()
s = remove_span(s, '    const regionRangeStart=', '    // Snapshot counts and share labels')
s = remove_span(s, '    const rhythmFirst=', '    const sparkEl=document.getElementById("spark");')
s = replace_once(s, "      directLabels+'</div>'+regionRange;", "      directLabels+'</div>';" )
s = replace_once(s, "      guides+bars+dateLabels+'</svg>'+rhythmRange;", "      guides+bars+dateLabels+'</svg>';" )
s = replace_once(s, '    const yearLabel=date=>date.getUTCFullYear().toString();\n', '')
s = replace_once(s, '    const firstDate=new Date(tMin),lastDate=new Date(tMax-dayMs);\n', '')
s = replace_once(s, '    // endpoints. Exact observed bounds are disclosed separately below the axis.', '    // endpoints. Keep the calendar axis free of supplementary range captions.')
s = replace_once(s, '    // One-line typographic readings use genuine CSS pixels on mobile. They', '    // Two-line regional readings use genuine CSS pixels on mobile. They')
s = replace_once(s, '    const labelMargin=Math.max(17,16*TW/axisCssWidth);', '    const labelMargin=Math.max(22,22*TW/axisCssWidth);')
s = replace_once(s, '    const minGap=Math.max(25,24*TW/axisCssWidth);', '    const minGap=Math.max(40,40*TW/axisCssWidth);')
assert 'chart-date-range' not in s and 'chart-date-zone' not in s
p.write_text(s)

p = Path('styles-refinement.css')
s = p.read_text()
s = replace_once(s, '  display:flex;flex-direction:row;align-items:baseline;gap:7px;\n  white-space:nowrap;font-variant-numeric:tabular-nums;\n  text-shadow:0 0 3px var(--surface);', '  display:grid;grid-template-columns:max-content max-content;\n  align-items:baseline;column-gap:7px;row-gap:3px;\n  white-space:nowrap;font-family:var(--sans);\n  font-variant-numeric:lining-nums tabular-nums;')
s = replace_once(s, '  color:var(--region-label-ink);font:700 10.5px/1.15 var(--mono);\n  letter-spacing:.045em;', '  grid-column:1 / -1;\n  color:var(--region-label-ink);font:600 11px/1.2 var(--sans);\n  letter-spacing:.04em;')
s = replace_once(s, '  color:var(--viz-secondary);font:650 15px/1.14 var(--mono);', '  color:var(--viz-secondary);font:500 18px/1.1 var(--sans);')
s = replace_once(s, '  color:var(--viz-quiet);font:500 10px/1.15 var(--mono);', '  color:var(--viz-quiet);font:400 10.5px/1.2 var(--sans);\n  letter-spacing:0;')
s = replace_once(s, '  #dist .region-end-label{gap:5px}\n  #dist .region-end-name{font-size:10px}\n  #dist .region-end-count{font-size:14.5px}\n  #dist .region-end-share{font-size:9.5px}', '  #dist .region-end-label{column-gap:6px}\n  #dist .region-end-name{font-size:10.5px}\n  #dist .region-end-count{font-size:17px}\n  #dist .region-end-share{font-size:10px}')
s = replace_once(s, '  #dist .region-end-label{gap:4px}\n  #dist .region-end-count{font-size:14px}\n  #dist .region-end-share{font-size:9px}\n  #dist .region-end-name{font-size:9.3px}', '  #dist .region-end-count{font-size:16px}\n  #dist .region-end-share{font-size:9.5px}\n  #dist .region-end-name{font-size:10px}')
s = remove_span(s, '#dist .chart-date-range,#spark .chart-date-range{', '@media(max-width:720px){')
s = replace_once(s, '  #dist .chart-date-range,#spark .chart-date-range{font-size:9px}\n', '')
s = replace_once(s, '/* Calendar labels share one typographic grammar; bounds are not axis ticks. */', '/* Calendar labels retain their approved cadence and typography. */')
assert 'chart-date-range' not in s and 'chart-date-zone' not in s
p.write_text(s)

# Preserve the proven loading-crash negative control after removing an unused helper.
p = Path('scripts/test_startup_date_scope.mjs')
s = replace_once(p.read_text(), "'    const yearLabel='", "'    const axisCssWidth='")
p.write_text(s)

# Keep the calendar behavior tests, replacing the rejected caption contract only.
p = Path('scripts/test_calendar_axes.mjs')
s = p.read_text().replace(',range:regionRange', '').replace(',range:rhythmRange', '')
s = re.sub(r'assert\.match\(h\.range,/[^\n]*?/\);', '', s)
s = re.sub(r'assert\.match\(c\.result\.range,/Local/\);', '', s)
s = s.replace('cross-year bounds disclose both years while monthly ticks remain exact month starts', 'cross-year monthly ticks remain exact month starts')
s += "\ntest('unrequested date-range and timezone captions are absent, not hidden',()=>{\n assert.doesNotMatch(app,/chart-date-range|chart-date-zone|const regionRange|const rhythmRange/);\n const css=readFileSync(new URL('../styles-refinement.css',import.meta.url),'utf8');\n assert.doesNotMatch(css,/chart-date-range|chart-date-zone/);\n});\n"
p.write_text(s)

p = Path('scripts/test_calendar_browser.mjs')
s = replace_once(p.read_text(), 'assert.equal(state.ranges,2)', 'assert.equal(state.ranges,0)')
needle = "  for(const marks of [state.dates,state.weeks])"
a = s.index(needle)
s = s[:a] + """  const type = await page.evaluate(()=>[...document.querySelectorAll('.region-end-label')].map(label=>{
   const parts=['name','count','share'].map(part=>{
    const node=label.querySelector('.region-end-'+part),r=node.getBoundingClientRect(),s=getComputedStyle(node);
    return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,font:s.fontFamily,size:parseFloat(s.fontSize),weight:s.fontWeight,numeric:s.fontVariantNumeric};
   });
   return {parts,siteFont:getComputedStyle(document.body).fontFamily};
  }));
  for(const {parts:[name,count,share],siteFont} of type){
   assert.ok(name.bottom+2<=count.y,'region acronym must occupy a separate first line');
   assert.ok(Math.abs(name.x-count.x)<1,'both lines must share their left edge');
   assert.ok(share.x>=count.right+5,'percentage must not crowd the count');
   assert.ok(share.y<count.bottom&&share.bottom>count.y,'count and share stay on the second line');
   for(const part of [name,count,share])assert.equal(part.font,siteFont,'reuse the site sans family');
   assert.equal(name.weight,'600');assert.equal(count.weight,'500');assert.equal(share.weight,'400');
   assert.ok(count.size>=16&&count.size<=18);assert.ok(count.size>name.size&&count.size>share.size);
   assert.ok(count.numeric.includes('tabular-nums'),'keep aligned figures without monospaced letterforms');
  }
""" + s[a:]
s = s.replace('results.push({engine,width,theme,state,errors})', 'results.push({engine,width,theme,state,typography:type,errors})')
p.write_text(s)

p = Path('scripts/test_market_width_browser.mjs')
s = p.read_text().replace("quality.shortLabelDisplays.every(v=>v==='flex')", "quality.shortLabelDisplays.every(v=>v==='grid')")
s = s.replace('each readable one-line annotation contains exact region, count and share', 'each two-line annotation contains exact region, count and share')
p.write_text(s)

for name in ['index.html', 'scripts/test_frontend_resilience.mjs']:
    p = Path(name)
    s = p.read_text()
    assert 'calendar-staircase-20261113' in s, name
    p.write_text(s.replace('calendar-staircase-20261113', 'region-type-clean-20261113'))

print('Scoped patch applied. Data, curves, date ticks, arrow positions and palette unchanged.')
