/* Offline city geography; reuse the existing index request and isolate map failures. */
(() => {
  'use strict';
  const simplify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[’']/g,'').replace(/[臺]/g,'台').replace(/[^a-z0-9\u3400-\u9fff]+/g,' ').trim();
  const provinceNames = {
    '11':['beijing','北京'],'12':['tianjin','天津'],'13':['hebei','河北'],'14':['shanxi','山西'],
    '15':['inner mongolia','内蒙古'],'21':['liaoning','辽宁'],'22':['jilin','吉林'],'23':['heilongjiang','黑龙江'],
    '31':['shanghai','上海'],'32':['jiangsu','江苏'],'33':['zhejiang','浙江'],'34':['anhui','安徽'],
    '35':['fujian','福建'],'36':['jiangxi','江西'],'37':['shandong','山东'],'41':['henan','河南'],
    '42':['hubei','湖北'],'43':['hunan','湖南'],'44':['guangdong','广东'],'45':['guangxi','广西'],
    '46':['hainan','海南'],'50':['chongqing','重庆'],'51':['sichuan','四川'],'52':['guizhou','贵州'],
    '53':['yunnan','云南'],'54':['tibet','xizang','西藏'],'61':['shaanxi','陕西'],'62':['gansu','甘肃'],
    '63':['qinghai','青海'],'64':['ningxia','宁夏'],'65':['xinjiang','新疆']
  };
  function buildIndex(atlas) {
    const aliases = new Map(), byId = new Map();
    for(const city of atlas.cities) {
      byId.set(city.id,city);
      if(['71','81','82'].includes(city.province))continue;
      for(const raw of city.aliases) {
        const key=simplify(raw);if(!key)continue;
        if(!aliases.has(key))aliases.set(key,new Set());aliases.get(key).add(city.id);
      }
    }
    return {aliases,byId,orderedAliases:[...aliases].sort((a,b)=>b[0].length-a[0].length)};
  }
  function locate(job,index) {
    const raw=String(job.city||'').trim()||String(job.locationRaw||'').split(',')[0].trim();
    if(!raw)return [];
    const text=simplify(raw.replace(/\b(?:metropolitan area|greater|area)\b/gi,'').replace(/都市圈|都会区|都會區/g,''));
    const exact=index.aliases.get(text);
    let groups=[];
    if(exact)groups=[{ids:[...exact],key:text}];
    else {
      // Match complete city aliases, longest first; never match "Taipei" within "New Taipei".
      const covered=[];
      for(const [key,ids] of index.orderedAliases) {
        let start=text.indexOf(key);
        while(start!==-1) {
          const end=start+key.length;
          const bounded=(!start||!/[a-z0-9]/.test(text[start-1]))&&(end===text.length||!/[a-z0-9]/.test(text[end]));
          if(bounded&&!covered.some(([a,b])=>start<b&&end>a)) {
            groups.push({ids:[...ids],key});covered.push([start,end]);
          }
          start=text.indexOf(key,end);
        }
      }
      // A multi-city label must consist of named cities and separators, not a province or unknown district.
      let rest=text;
      for(const [a,b] of covered.sort((a,b)=>b[0]-a[0]))rest=rest.slice(0,a)+' '.repeat(b-a)+rest.slice(b);
      if(rest.replace(/\b(?:and|city|cities)\b/g,'').replace(/[和与及、\s]/g,''))return [];
    }
    if(!groups.length)return [];
    const context=simplify(job.locationRaw||'');
    const hinted=Object.entries(provinceNames).filter(([,names])=>names.some(n=>new RegExp('(?:^|[ ,])'+n+'(?:$|[ ,])').test(context))).map(([id])=>id);
    const peerProvinces=new Set(groups.filter(g=>g.ids.length===1).map(g=>index.byId.get(g.ids[0]).province));
    const resolved=[];
    for(const group of groups) {
      let ids=group.ids;
      if(ids.length>1&&hinted.length)ids=ids.filter(id=>hinted.includes(index.byId.get(id).province));
      if(ids.length>1&&peerProvinces.size===1)ids=ids.filter(id=>peerProvinces.has(index.byId.get(id).province));
      if(ids.length!==1)return []; // Never guess a homonymous city or partially place an ambiguous region.
      resolved.push(ids[0]);
    }
    return [...new Set(resolved)];
  }
  function summarize(rows,atlas) {
    const index=buildIndex(atlas),counts=new Map(),companies=new Map(),memo=new Map();let total=0,mapped=0,multi=0,mentions=0;
    // Keep exactly the app's canonical ID deduplication when available.
    const data=typeof keepLatestSameCityTitle==='function'?keepLatestSameCityTitle(rows):rows;
    for(const job of data) {
      if(String(job.location||'').toUpperCase()!=='CN'||job.jobStatus==='expired')continue;
      total++;const key=String(job.city||'')+'\0'+String(job.locationRaw||'');
      if(!memo.has(key))memo.set(key,locate(job,index));
      const ids=memo.get(key);if(!ids.length)continue;
      mapped++;if(ids.length>1)multi++;
      const company=typeof canonicalCompany==='function'?canonicalCompany(job.company):String(job.company||'').trim();
      for(const id of ids){
        counts.set(id,(counts.get(id)||0)+1);mentions++;
        if(company){if(!companies.has(id))companies.set(id,new Set());companies.get(id).add(company);}
      }
    }
    const ranked=[...counts].sort((a,b)=>b[1]-a[1]||index.byId.get(a[0]).name.localeCompare(index.byId.get(b[0]).name,'zh-CN'));
    return {total,mapped,multi,mentions,unmapped:total-mapped,counts,companies,ranked,index,max:ranked[0]?.[1]||0};
  }
  const bucket=(count,max)=>!count?0:Math.min(5,Math.max(1,Math.ceil(Math.sqrt(count/Math.max(1,max))*5)));
  const api={simplify,buildIndex,locate,summarize,bucket};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined')return;
  window.CNCityMap=api;
  const panel=document.getElementById('cnCityMap'),toggle=document.getElementById('cnCityMapToggle');
  if(!panel||!toggle)return;
  let ready=false,pending=null,atlasCache=null;
  const ns='http://www.w3.org/2000/svg';
  const node=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;};
  const html=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!=null)n.textContent=text;return n;};
  const number=n=>n.toLocaleString('zh-CN');
  function render(atlas,rows) {
    const s=summarize(rows,atlas);panel.replaceChildren();
    const summary=html('div','cn-map-summary');
    for(const [n,label]of [[s.mapped,'职位'],[s.counts.size,'城市'],[s.multi,'跨城职位']]) {
      const item=html('div','cn-map-metric');item.append(html('strong','',number(n)),html('span','',label));summary.append(item);
    }
    panel.append(summary);
    const layout=html('div','cn-map-layout'),stage=html('div','cn-map-stage');
    const svg=node('svg',{viewBox:atlas.viewBox.join(' '),class:'cn-map-svg',role:'group','aria-label':'中国城市职位分布图，含台湾。颜色深浅区分涉及职位数量，详见图例。'});
    svg.append(node('title',{},'CN active roles by city'),node('desc',{},'按地级市展示有效CN职位；跨城职位分别计入明确涉及的城市。台湾保留整体轮廓。'));
    const paths=new Map();
    for(const city of atlas.cities) {
      const count=s.counts.get(city.id)||0;
      const p=node('path',{d:city.path,class:'cn-map-city heat-'+bucket(count,s.max),'data-city-id':city.id,'fill-rule':'evenodd'});
      p.append(node('title',{},city.name+' · '+number(count)+' 职位'));
      if(count){p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',city.name+'，'+number(count)+'职位');}
      paths.set(city.id,p);svg.append(p);
    }
    svg.append(node('rect',{x:761,y:429,width:127,height:138,rx:3,class:'cn-map-inset-frame'}));
    for(const city of atlas.cities)if(city.inset)svg.append(node('path',{d:city.inset,class:'cn-map-city cn-map-inset heat-'+bucket(s.counts.get(city.id)||0,s.max),'data-city-id':city.id,'fill-rule':'evenodd'}));
    if(atlas.seaLines)svg.append(node('path',{d:atlas.seaLines,class:'cn-map-sea-lines'}));
    svg.append(node('text',{x:824.5,y:582,'text-anchor':'middle',class:'cn-map-inset-label'},'南海诸岛'));
    const taiwan=atlas.cities.find(c=>c.id==='710000');
    if(taiwan)svg.append(node('text',{x:taiwan.point[0]+19,y:taiwan.point[1]+3,class:'cn-map-place-label'},'台湾'));
    stage.append(svg);layout.append(stage);
    const aside=html('aside','cn-map-aside'),detail=html('div','cn-map-detail');detail.setAttribute('aria-live','polite');
    const detailName=html('h4',''),detailCount=html('p','cn-map-detail-count'),detailHint=html('p','cn-map-detail-hint','悬浮、轻点或使用键盘查看城市');detail.append(detailName,detailCount,detailHint);aside.append(detail);
    const rank=html('ol','cn-map-ranking');rank.setAttribute('aria-label','职位最多的城市');
    const rankButtons=new Map();
    for(const [id,count]of s.ranked.slice(0,6)) {
      const item=html('li',''),button=html('button','cn-map-rank');button.type='button';button.dataset.cityId=id;
      button.style.setProperty('--city-share',String(count/s.max));
      button.append(html('span','cn-map-rank-name',s.index.byId.get(id).name.replace(/市$/,'')),html('strong','',number(count)));item.append(button);rank.append(item);rankButtons.set(id,button);
    }
    aside.append(rank);layout.append(aside);panel.append(layout);
    const legend=html('div','cn-map-legend');legend.setAttribute('aria-label','色阶图例，0至'+number(s.max)+'职位');
    legend.append(html('span','','0'));
    for(let b=0;b<=5;b++)legend.append(html('i','heat-'+b));
    legend.append(html('span','',number(s.max)),html('span','cn-map-legend-label','职位数'));panel.append(legend);
    const source=html('a','cn-map-source','地图数据来源与许可');source.href='assets/maps/NOTICE.txt';source.target='_blank';source.rel='noopener';panel.append(source);
    let selected='';
    function select(id) {
      if(!s.index.byId.has(id)||selected===id)return;
      paths.get(selected)?.classList.remove('is-selected');rankButtons.get(selected)?.setAttribute('aria-pressed','false');
      selected=id;paths.get(id)?.classList.add('is-selected');rankButtons.get(id)?.setAttribute('aria-pressed','true');
      detailName.textContent=s.index.byId.get(id).name;
      const jobsMetric=html('span','cn-map-detail-metric'),companyMetric=html('span','cn-map-detail-metric cn-map-company-count');
      jobsMetric.append(html('strong','',number(s.counts.get(id)||0)),document.createTextNode('职位'));
      companyMetric.append(html('strong','',number(s.companies.get(id)?.size||0)),document.createTextNode('公司'));
      detailCount.replaceChildren(jobsMetric,companyMetric);
    }
    const inspect=e=>{const target=e.target.closest('[data-city-id]');if(target)select(target.dataset.cityId);};
    for(const event of ['pointerover','focusin','click'])layout.addEventListener(event,inspect);
    svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(e);}});
    if(s.ranked.length)select(s.ranked[0][0]);else{detailName.textContent='暂无可定位职位';detailCount.textContent='有明确城市的有效CN职位会显示在这里。';}
  }
  async function load() {
    if(ready||pending)return pending;
    panel.replaceChildren(html('p','cn-map-state','正在加载城市地图…'));
    pending=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try {
        const atlasPromise=fetch('assets/maps/cn-cities.json',{signal:controller.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Map HTTP '+r.status);return r.json();});
        const rowsPromise=window.__jobsDataPromise;if(!rowsPromise)throw Error('Job index is unavailable');
        atlasCache=await atlasPromise;const rows=await window.__jobsDataPromise;render(atlasCache,window.AuthGuest?.chartRows||rows);ready=true;
      } catch(error) {
        const message=html('p','cn-map-state','城市地图暂时无法加载。');const retry=html('button','top50-toggle cn-map-retry','Retry');retry.type='button';retry.addEventListener('click',()=>load());panel.replaceChildren(message,retry);
      } finally {clearTimeout(timer);pending=null;}
    })();return pending;
  }
  window.addEventListener('employermodescoped',()=>{if(ready&&atlasCache)render(atlasCache,window.AuthGuest?.chartRows||window.__jobsScopedRows||[]);});
  toggle.addEventListener('click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Collapse':'Expand';panel.hidden=!expanded;if(expanded)load();
  });
})();

