/* Date shells stay stable; only a buffered window of job cards is mounted. */
(()=>{
  const raf=()=>new Promise(requestAnimationFrame),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class JobListView{
    constructor({host,render,onMount}){
      this.host=host;this.render=render;this.onMount=onMount;this.blocks=[];this.cache=[];this.open=new Set();this.frame=0;this.jump=0;this.full=false;this.dead=false;
      host._jobView=this;host.classList.add('job-windowed');
      this.scroll=()=>this.schedule();window.addEventListener('scroll',this.scroll,{passive:true});
      this.resize=()=>{if(this.host.clientWidth!==this.estimateWidth)this.invalidate();else this.schedule(true);};window.addEventListener('resize',this.resize,{passive:true});
      this.cancelJump=()=>{this.jump++;};for(const type of ['wheel','touchstart','pointerdown'])window.addEventListener(type,this.cancelJump,{passive:true});
      host.addEventListener('pointerdown',event=>this.interaction=event.target.closest('.day'),{passive:true});
      this.observer=new ResizeObserver(()=>this.schedule(true));
      for(const element of [host,document.querySelector('.masthead'),document.querySelector('.toolbar')])if(element)this.observer.observe(element);
      this.find=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f')this.expandAll();if(event.key==='Escape'&&this.full){this.full=false;this.schedule(true);}};window.addEventListener('keydown',this.find);
      this.print=()=>this.expandAll();this.afterPrint=()=>{this.full=false;this.schedule(true);};window.addEventListener('beforeprint',this.print);window.addEventListener('afterprint',this.afterPrint);
    }
    capture(){
      const top=this.toolbar()+14;
      for(const block of this.blocks){if(!block.mounted)continue;const rect=block.el.getBoundingClientRect();if(rect.bottom<=top||rect.top>innerHeight)continue;
        for(const card of block.el._jobCards){const box=card.getBoundingClientRect();if(box.bottom>top&&box.top<innerHeight)return {id:card.dataset.id,top:box.top};}
      }
      return null;
    }
    toolbar(){return document.querySelector('.toolbar')?.offsetHeight||0;}
    remember(block){for(const card of block.el._jobCards||[]){const opened=card.querySelector('details.job-jd')?.open||card.querySelector('.job-jd-toggle')?.getAttribute('aria-expanded')==='true';if(opened)this.open.add(card.dataset.id);else this.open.delete(card.dataset.id);}}
    set(rows,meta,{anchor=null}={}){
      this.jump++;for(const block of this.blocks)if(block.mounted)this.remember(block);
      this.estimateWidth=this.host.clientWidth;this.compact=document.body.classList.contains("compact");this.full=false;this.rows=rows;this.meta=meta;this.blocks=[];this.cache=[];const days=new Map();
      for(const index of rows){const r=meta[index];let day=days.get(r.day);if(!day){day={key:r.day,label:r.label,indices:[],active:0};days.set(r.day,day);}day.indices.push(index);if(r.status!=='expired')day.active++;}
      this.days=[...days.values()];const fragment=document.createDocumentFragment();
      for(const day of this.days)for(let offset=0;offset<day.indices.length;offset+=64){
        const indices=day.indices.slice(offset,offset+64),el=document.createElement('section');el.className='day';el.dataset.dayKey=day.key;el.dataset.dayLabel=day.label;el.dataset.dayContinuation=offset?'1':'0';
        if(!offset)el.innerHTML='<div class="day-head"><span class="day-date">'+escape(day.label)+'</span><span class="day-meta tnum" data-role="daycount">'+day.active+' 个有效职位</span></div>';
        const height=indices.reduce((sum,i)=>sum+this.estimate(meta[i]),0)+(offset?0:36);el.style.height=height+'px';el._jobCards=[];el._favoriteCards=new Set();
        const block={el,indices,height,mounted:false,top:0};this.blocks.push(block);fragment.appendChild(el);
      }
      this.host.replaceChildren(fragment);this.read();
      if(anchor){const target=this.blocks.find(b=>b.indices.some(i=>meta[i].id===anchor.id));if(target){this.mount(target);this.read();this.restore(anchor);}else this.resetTop();}
      this.update();this.onMount?.();
    }
    estimate(row){
      const compact=this.compact,width=this.estimateWidth,mobile=width<650;
      const line=compact?19:22.4,available=Math.max(140,width-(mobile?54:220)),chars=Math.max(15,Math.floor(available/(compact?7:7.8))),lines=Math.max(1,Math.ceil(row.displayTitle.length/chars));
      return (mobile?(compact?61:78):(compact?50:82))+(lines-1)*line;
    }
    read(){
      const y=scrollY,root=this.host.getBoundingClientRect();this.top=root.top+y;this.width=root.width;
      for(const block of this.blocks){const box=block.el.getBoundingClientRect();block.top=box.top+y;block.height=box.height;}
    }
    mount(block){
      if(block.mounted)return;block.mounted=true;block.el.style.height='auto';
      if(block.cached){block.el.appendChild(block.cached);block.cached=null;this.cache=this.cache.filter(b=>b!==block);}
      else{const template=document.createElement('template');template.innerHTML=block.indices.map((index,i)=>this.render(index,i)).join('');block.el.appendChild(template.content);}block.el._jobCards=[...block.el.querySelectorAll('.job')];block.el._favoriteCards=new Set(block.el._jobCards.filter(card=>card.classList.contains('is-favorite')));
      queueMicrotask(()=>{for(const card of block.el._jobCards)if(this.open.has(card.dataset.id)){const details=card.querySelector('details.job-jd'),button=card.querySelector('.job-jd-toggle');if(button&&button.getAttribute('aria-expanded')!=='true')button.click();else if(details)details.open=true;}});
    }
    pinned(block){const selection=getSelection();return block.el.contains(document.activeElement)||(selection&&!selection.isCollapsed&&block.el.contains(selection.anchorNode))||(document.querySelector('.job-action-sheet[open]')&&this.interaction===block.el);}
    unmount(block){
      if(!block.mounted||this.pinned(block))return;this.remember(block);
      block.height=block.el.getBoundingClientRect().height;block.el.style.height=block.height+'px';
      // Keep recent DOM and decoded logos intact for natural reverse scrolling.
      block.cached=document.createDocumentFragment();for(const card of block.el._jobCards)block.cached.appendChild(card);
      block.el._jobCards=[];block.el._favoriteCards.clear();block.mounted=false;this.cache.push(block);
      while(this.cache.length>8){const oldest=this.cache.shift();oldest.cached=null;}

    }
    indexAt(y){let low=0,high=this.blocks.length-1,result=0;while(low<=high){const mid=(low+high)>>1;if(this.blocks[mid].top<=y){result=mid;low=mid+1;}else high=mid-1;}return result;}
    update(){
      if(!this.blocks.length)return;
      if(this.full){for(const block of this.blocks)this.mount(block);this.read();this.onMount?.();return;}
      const low=scrollY-innerHeight*.7,high=scrollY+innerHeight*1.7,start=Math.max(0,this.indexAt(low)),end=Math.min(this.blocks.length-1,this.indexAt(high));let changed=false;const anchor=this.capture();
      for(let i=0;i<this.blocks.length;i++){const block=this.blocks[i];if(i>=start&&i<=end){if(!block.mounted){this.mount(block);changed=true;}}else if(block.mounted&&!this.pinned(block)&&(block.top+block.height<scrollY-innerHeight*3||block.top>scrollY+innerHeight*4)){this.unmount(block);changed=true;}}
      if(changed){this.read();this.restore(anchor);this.onMount?.();requestAnimationFrame(()=>{if(!this.dead)this.read();});}
    }
    schedule(read=false){this.needsRead||=read;if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.dead)return;if(this.needsRead){this.needsRead=false;this.read();}this.update();});}
    restore(anchor){if(!anchor)return;const card=this.host.querySelector('.job[data-id="'+CSS.escape(anchor.id)+'"]');if(card){const delta=card.getBoundingClientRect().top-anchor.top;if(Math.abs(delta)>.5&&scrollY>0)scrollBy({top:delta,behavior:'instant'});}}
    resetTop(){if(scrollY>this.top-this.toolbar())scrollTo({top:Math.max(0,this.top-this.toolbar()-14),behavior:'instant'});}
    invalidate(anchor=this.capture()){
      this.estimateWidth=this.host.clientWidth;this.compact=document.body.classList.contains("compact");this.cache=[];
      for(const block of this.blocks){if(block.mounted)this.remember(block);block.cached=null;block.el._jobCards.forEach(card=>card.remove());block.el._jobCards=[];block.el._favoriteCards.clear();block.mounted=false;block.height=block.indices.reduce((sum,i)=>sum+this.estimate(this.meta[i]),0)+(block.el.dataset.dayContinuation==='1'?0:36);block.el.style.height=block.height+'px';}
      this.read();if(anchor){const block=this.blocks.find(b=>b.indices.some(i=>this.meta[i].id===anchor.id));if(block)this.mount(block);this.read();this.restore(anchor);}this.update();
    }
    activeDay(){if(scrollY<this.top-this.toolbar())return null;const block=this.blocks[this.indexAt(scrollY+this.toolbar()+15)];return block?.el.dataset.dayKey||null;}
    async scrollToDay(key){
      const block=this.blocks.find(b=>b.el.dataset.dayKey===key);if(!block)return;const token=++this.jump;
      this.mount(block);await raf();if(token!==this.jump)return;this.read();
      const destination=Math.max(0,Math.min(block.top-this.toolbar()-14,document.documentElement.scrollHeight-innerHeight));scrollTo({top:destination,behavior:'instant'});
      this.update();let stable=0;
      // Mobile decoration and neighboring buffers can settle on subsequent frames.
      for(let i=0;i<14;i++){await raf();if(token!==this.jump)return;this.read();const desired=Math.max(0,Math.min(block.top-this.toolbar()-14,document.documentElement.scrollHeight-innerHeight));if(Math.abs(scrollY-desired)>1){scrollTo({top:desired,behavior:'instant'});stable=0;}else if(++stable>=4)break;this.update();}

    }
    expandAll(){this.full=true;this.update();}
  }
  window.JobListView=JobListView;
})();

/* Exact-title role histories use the full retained index, never filtered rows. */
(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=job=>Date.parse(job.pushTime||job.firstSeen||'')||0;
 const first=job=>Date.parse(job.firstSeen||'')||0;
 const panelId=id=>'job-role-history-'+encodeURIComponent(id);
 function build(rows,{company,region,city,id}){
  const groups=new Map();
  for(const job of rows){
   const identity=id(job),name=company(job),area=region(job),title=job?.title;
   if(!identity||!name||typeof title!=='string'||!title.trim())continue;
   let place='';
   if(area==='CN'){
    place=String(city(job)||'').trim();
    // Missing cities and broad country/province/metro labels cannot prove the same city.
    if(!place||/^(?:n\/?a|unknown|china|mainland china|中国|中国大陆|全国|remote)$/i.test(place)||/metropolitan|\bprovince\b|省|都市圈/i.test(place))continue;
    place=place.toLocaleLowerCase('en-US');
   }else if(!['HK','SG'].includes(area))continue;
   const key=JSON.stringify([name,area,place,title]);let group=groups.get(key);
   if(!group){group={company:name,region:area,city:area==='CN'?String(city(job)).trim():'',entries:new Map()};groups.set(key,group);}
   const old=group.entries.get(identity);if(!old||stamp(job)>stamp(old))group.entries.set(identity,job);
  }
  const latest=new Map();
  for(const group of groups.values()){
   if(group.entries.size<2)continue;
   group.entries=[...group.entries.values()].sort((a,b)=>stamp(b)-stamp(a)||first(b)-first(a)||id(b).localeCompare(id(a),'en',{numeric:true}));
   group.owner=id(group.entries[0]);latest.set(group.owner,group);
  }
  return latest;
 }
 function button(group){if(!group)return '';return '<button type="button" class="job-history-toggle" aria-expanded="false" aria-controls="'+escape(panelId(group.owner))+'" aria-label="Show '+group.entries.length+' listings with this exact title" title="View all '+group.entries.length+' listings"><span class="co-separator" aria-hidden="true"></span><span class="co-separator" aria-hidden="true"></span><span class="co-separator" aria-hidden="true"></span></button>';}
 function bind(host,{get,id,link,onVisit}){
  const desktop=()=>matchMedia('(min-width:721px)').matches,opened=new Set();
  const date=value=>{if(typeof value!=='string'||!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}):'—';};
  function populate(card,group){
   let panel=card.querySelector('.job-history-panel');if(panel)return panel;
   panel=document.createElement('section');panel.className='job-history-panel';panel.id=panelId(group.owner);panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Listings with the same title');
   const context=group.company+' · '+group.region+(group.city?' · '+group.city:'');
   panel.innerHTML='<header class="job-history-heading"><div><h3>Role history</h3><p>'+escape(context)+'</p></div><span>'+group.entries.length+' listings</span></header><ol class="job-history-list">'+group.entries.map((job,index)=>{const closed=job.jobStatus==='expired',identity=id(job),href=link(job.link);return '<li class="job-history-item'+(closed?' is-closed':'')+'" data-history-id="'+escape(identity)+'"><div class="job-history-item-heading"><a class="job-history-link" href="'+escape(href)+'" target="_blank" rel="noopener">'+escape(job.title)+'</a><span class="job-history-state'+(closed?' is-closed':'')+'">'+(closed?'Closed':'Active')+'</span></div><div class="job-history-item-meta"><span>'+escape(date(job.firstSeen||job.pushTime))+' -'+(closed?' '+escape(date(job.expiredAt)):'')+'</span></div></li>';}).join('')+'</ol>';
   card.querySelector('.job-meta-line').appendChild(panel);return panel;
  }
  function set(card,expanded,{focus=false}={}){
   const trigger=card?.querySelector('.job-history-toggle'),group=trigger&&get(card.dataset.id);if(!group)return;
   if(expanded&&!desktop())return;
   const panel=expanded?populate(card,group):card.querySelector('.job-history-panel');if(panel)panel.hidden=!expanded;
   trigger.setAttribute('aria-expanded',String(expanded));trigger.setAttribute('aria-label',(expanded?'Hide':'Show')+' '+group.entries.length+' listings with this exact title');
   expanded?opened.add(card.dataset.id):opened.delete(card.dataset.id);if(focus)trigger.focus({preventScroll:true});host._jobView?.schedule(true);
  }
  host.addEventListener('click',event=>{
   const trigger=event.target.closest?.('.job-history-toggle');
   if(trigger){event.preventDefault();event.stopImmediatePropagation();if(desktop())set(trigger.closest('.job'),trigger.getAttribute('aria-expanded')!=='true');return;}
   const target=event.target.closest?.('.job-history-link');if(target){const item=target.closest('.job-history-item');if(item)onVisit?.(item.dataset.historyId);}
  },true);
  host.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const target=event.target.closest?.('.job-history-panel,.job-history-toggle');if(!target)return;const card=target.closest('.job');if(card?.querySelector('.job-history-toggle')?.getAttribute('aria-expanded')!=='true')return;event.preventDefault();event.stopImmediatePropagation();set(card,false,{focus:true});},true);
  return {restore(){if(!opened.size||!desktop())return;for(const trigger of host.querySelectorAll('.job-history-toggle')){const card=trigger.closest('.job');if(opened.has(card.dataset.id)&&trigger.getAttribute('aria-expanded')!=='true')set(card,true);}}};
 }
 window.JobRoleHistory={build,button,bind};
})();
