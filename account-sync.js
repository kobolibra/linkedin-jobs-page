/* Account-scoped cache + durable per-operation outbox; never upload entire lists. */
(()=>{
 const kinds=['favs','blocked','blockedKw','reads','applications','favoriteTypes'],parse=(s,fallback)=>{try{return JSON.parse(s)||fallback;}catch{return fallback;}};
 const keyOf=(kind,item)=>JSON.stringify([kind,item]);
 class Preferences{
  constructor({user,api,status,expired}){
   this.user=user;this.api=api;this.status=status;this.expired=expired;this.prefix='lj-account-v2:'+user.id+':';this.rows=new Map();this.jobReplacements=new Map();this.cursor=0;this.memory=new Map();this.last='';this.stopped=false;this.busy=null;
   this.readCache();
   try{const owner=localStorage.getItem('lj-legacy-owner');if(!owner){const legacy={};for(const kind of kinds)legacy[kind]=parse(localStorage.getItem(kind),[]);localStorage.setItem(this.prefix+'legacy',JSON.stringify(legacy));localStorage.setItem('lj-legacy-owner',user.id);}}catch{this.status('浏览器存储不可用，当前更改请保持页面打开直至同步');}
   addEventListener('storage',e=>{if(e.key?.startsWith(this.prefix)){this.readCache();this.emit();this.schedule();}});
   addEventListener('online',()=>this.schedule(0));addEventListener('focus',()=>this.schedule(0));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.schedule(0);});
   this.interval=setInterval(()=>{if(document.visibilityState==='visible')this.schedule(0);},60000);
  }
  readCache(){try{const c=parse(localStorage.getItem(this.prefix+'cache'),{});this.cursor=Math.max(this.cursor,c.cursor||0);for(const row of c.entries||[]){const key=keyOf(row.kind,row.item);if((this.rows.get(key)?.revision||0)<row.revision)this.rows.set(key,row);}}catch{}}
  pending(){const all=new Map(this.memory);try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(this.prefix+'op:')){const op=parse(localStorage.getItem(key),null);if(op)all.set(op.id,op);}}}catch{}return [...all.values()].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));}
  connectJobIndex(index){
   const ready=index.then(doc=>{this.setJobReplacements(doc?.linkedinJobReplacements);return doc;});
   this.jobIndexReady=ready.then(()=>window.JobIndexStore?.cacheState!=='stale',()=>false);
   return ready;
  }
  setJobReplacements(replacements){
   const edges=new Map(Object.entries(replacements||{}).filter(([old,next])=>/^ln:[0-9]+$/.test(old)&&typeof next==='string'&&/^ln:[0-9]+$/.test(next)));
   this.jobReplacements.clear();
   for(const old of edges.keys()){
    const visited=new Set();let current=old;
    while(edges.has(current)&&!visited.has(current)){visited.add(current);current=edges.get(current);}
    if(!edges.has(current))this.jobReplacements.set(old,current);
   }
   this.emit();
  }
  jobKey(item){return this.jobReplacements.get(item)||item;}
  snapshot(){
   // Resolve server revisions and queued user actions across the entire replacement chain.
   const pending=this.pending(),map=new Map(this.rows),favorites=new Map();
   for(const row of this.rows.values()){
    if(row.kind!=='favs')continue;
    const item=this.jobKey(row.item);
    if((favorites.get(item)?.revision||0)<row.revision)favorites.set(item,row);
   }
   for(const op of pending){
    if(op.kind==='favs')favorites.set(this.jobKey(op.item),op);
    else map.set(keyOf(op.kind,op.item),op);
   }
   const lists=Object.fromEntries(kinds.map(k=>[k,[]]));
   for(const [item,row] of favorites)if(row.present)lists.favs.push(item);
   for(const row of map.values()){
    if(!row.present||!lists[row.kind]||row.kind==='favs')continue;
    let item=row.item;
    if(this.jobReplacements.size&&(row.kind==='applications'||row.kind==='favoriteTypes')){
     // Keep the stored events immutable while presenting one journey for the role.
     const event=parse(item,null),job=this.jobReplacements.get(event?.j);
     if(job)item=JSON.stringify({...event,j:job});
    }
    lists[row.kind].push(item);
   }
   for(const k of kinds)lists[k].sort();
   return lists;
  }
  toggleFavorite(item){
   item=this.jobKey(item);
   const present=!this.snapshot().favs.includes(item);
   this.enqueue('favs',item,present);this.emit();this.schedule();return present;
  }
  get(kind){return kinds.includes(kind)?JSON.stringify(this.snapshot()[kind]):null;}
  set(kind,text){if(!kinds.includes(kind))return false;const next=new Set(parse(text,[]).filter(x=>typeof x==='string'&&x.trim()&&x.length<=500&&!/[\u0000-\u001f\u007f]/.test(x))),old=new Set(this.snapshot()[kind]);for(const item of new Set([...old,...next]))if(old.has(item)!==next.has(item))this.enqueue(kind,item,next.has(item));this.emit();this.schedule();return true;}
  enqueue(kind,item,present){const op={id:crypto.randomUUID().replaceAll('-',''),kind,item,present,time:(this.clock=Math.max(Date.now(),(this.clock||0)+1))};this.memory.set(op.id,op);try{localStorage.setItem(this.prefix+'op:'+op.id,JSON.stringify(op));}catch{this.status('浏览器存储已满，请保持页面打开直至同步');}}
  emit(){const snapshot=this.snapshot(),text=JSON.stringify(snapshot);if(text===this.last)return;this.last=text;dispatchEvent(new CustomEvent('account-preferences',{detail:snapshot}));}
  persist(){this.readCache();try{localStorage.setItem(this.prefix+'cache',JSON.stringify({cursor:this.cursor,entries:[...this.rows.values()]}));}catch{}}
  schedule(delay=350){if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),delay);}
  async refresh(){let more;do{const r=await this.api('/auth/preferences?since='+this.cursor);if(r.status===401){this.stopped=true;this.expired();throw Error('expired');}if(!r.ok)throw Error('sync');const data=await r.json();if(data.userId!==this.user.id){this.stop();this.expired();throw Error('identity');}for(const row of data.entries){const key=keyOf(row.kind,row.item);if((this.rows.get(key)?.revision||0)<row.revision)this.rows.set(key,row);}this.cursor=data.cursor;more=data.more;this.persist();}while(more);this.emit();}
  readLegacy(){try{return parse(localStorage.getItem(this.prefix+'legacy'),null);}catch{return null;}}
  importLegacy(legacy,importFavorites){
   if(!legacy)return;
   const key=this.prefix+'legacy';
   // A local import is older than an explicit account action on any confirmed ID.
   const operations=this.pending(),pending=new Set(operations.map(o=>keyOf(o.kind,o.item)));
   const knownFavorites=new Set();
   for(const row of [...this.rows.values(),...operations])if(row.kind==='favs')knownFavorites.add(this.jobKey(row.item));
   for(const kind of kinds){
    if(kind==='favs'&&!importFavorites)continue;
    for(let item of legacy[kind]||[]){
     if(typeof item!=='string')continue;
     if((kind==='favs'||kind==='reads')&&typeof jobId==='function')item=jobId(item);
     if(kind==='blocked'&&typeof canonicalCompany==='function')item=canonicalCompany(item);
     if(!item||item.length>500||/[\u0000-\u001f\u007f]/.test(item))continue;
     const opKey=keyOf(kind,item),favorite=kind==='favs'?this.jobKey(item):null;
     if(this.rows.has(opKey)||pending.has(opKey)||knownFavorites.has(favorite))continue;
     this.enqueue(kind,favorite||item,true);
     if(favorite)knownFavorites.add(favorite);
     pending.add(opKey);
    }
   }
   try{
    if(importFavorites)localStorage.removeItem(key);
    else localStorage.setItem(key,JSON.stringify({favs:legacy.favs}));
   }catch{}
   this.emit();
  }
  async flush(){if(this.stopped)return false;if(this.busy)return this.busy;this.busy=(async()=>{try{this.status('正在同步…');
    const legacy=this.readLegacy();
    const importFavorites=!legacy?.favs?.length||!this.jobIndexReady||await this.jobIndexReady;
    if(this.stopped)return false;
    await this.refresh();
    this.importLegacy(legacy,importFavorites);
    let pending=this.pending();while(pending.length){const batch=[];let bytes=40;for(const op of pending.slice(0,100)){const size=new TextEncoder().encode(JSON.stringify(op)).length+1;if(bytes+size>48000)break;batch.push(op);bytes+=size;}const r=await this.api('/auth/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':this.user.csrf},body:JSON.stringify({operations:batch.map(({id,kind,item,present})=>({id,kind,item,present}))})});if(r.status===401){this.stopped=true;this.expired();return false;}if(!r.ok)throw Error('sync');const data=await r.json();
    // Fetch the server result before retiring the durable outbox. A lost GET is retryable.
    await this.refresh();for(const id of data.acknowledged){this.memory.delete(id);try{localStorage.removeItem(this.prefix+'op:'+id);}catch{}}this.emit();pending=this.pending();}
   this.status('已同步至账号');return true;}catch{if(!this.stopped){this.status('暂未同步 · 恢复网络后自动重试');this.schedule(15000);}return false;}finally{this.busy=null;}})();return this.busy;}
  stop(){this.stopped=true;clearTimeout(this.timer);clearInterval(this.interval);}
 }
 window.createAccountPreferences=options=>new Preferences(options);
})();

