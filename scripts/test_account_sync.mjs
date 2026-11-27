import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {preferences} from '../account-preferences.mjs';
const source=readFileSync(new URL('../account-sync.js',import.meta.url),'utf8');
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const name of ['0001_accounts','0002_account_sync'])sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO account_users VALUES('alpha','Alpha',0),('beta','Beta',0)");
 class Statement{constructor(text,args=[]){this.text=text;this.args=args;}bind(...args){return new Statement(this.text,args);}async first(){return sql.prepare(this.text).get(...this.args)||null;}async all(){return {results:sql.prepare(this.text).all(...this.args)};}async run(){return sql.prepare(this.text).run(...this.args);}}
 const db={prepare:t=>new Statement(t),async batch(stmts){sql.exec('BEGIN');try{for(const s of stmts)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const stores=[];function storage(seed={}){const data=new Map(Object.entries(seed)),tabs=[];stores.push(data);return {data,tabs};}
 function client(user='alpha',store=storage()){
  const events=new EventTarget(),document=new EventTarget();document.visibilityState='visible';const timers=new Set();let offline=false,loseAck=false,expired=false;const statuses=[],localStorage={get length(){return store.data.size;},key:i=>[...store.data.keys()][i]??null,getItem:k=>store.data.get(k)??null,setItem(k,v){v=String(v);if(store.data.get(k)===v)return;store.data.set(k,v);for(const tab of store.tabs)if(tab!==events){const e=new Event('storage');e.key=k;tab.dispatchEvent(e);}},removeItem(k){if(!store.data.delete(k))return;for(const tab of store.tabs)if(tab!==events){const e=new Event('storage');e.key=k;tab.dispatchEvent(e);}}};store.tabs.push(events);
  const scope={console,crypto,TextEncoder,CustomEvent,Event,document,localStorage,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setTimeout(fn){const id={fn};timers.add(id);return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>null,clearInterval:()=>{}};scope.window=scope;
  vm.runInNewContext(source,scope);
  const api=async(path,options={})=>{if(offline)throw Error('offline');const result=await preferences(new Request('https://site.test'+path,{...options,headers:{origin:'https://site.test',...options.headers}}),{AUTH_ORIGIN:'https://site.test',AUTH_DB:db},{user_id:user,csrf:'csrf-'+user});if(loseAck&&options.method==='POST'){loseAck=false;throw Error('response_lost');}return result;};
  const sync=scope.createAccountPreferences({user:{id:user,csrf:'csrf-'+user},api,status:t=>statuses.push(t),expired:()=>{expired=true;}});
  return {sync,store,statuses,offline(v){offline=v;},loseAck(){loseAck=true;},expired:()=>expired};
 }
 return {client,storage,sql,db};
}
test('two devices merge independent favorites, blocks, keywords and reads; deletion stays deleted',async()=>{
 const f=fixture(),a=f.client(),b=f.client();await a.sync.flush();await b.sync.flush();
 a.sync.set('favs','["ln:123"]');a.sync.set('blocked','["Acme"]');b.sync.set('blockedKw','["intern"]');b.sync.set('reads','["ln:456"]');
 await a.sync.flush();await b.sync.flush();await a.sync.flush();for(const c of [a,b]){assert.deepEqual(JSON.parse(c.sync.get('favs')),['ln:123']);assert.deepEqual(JSON.parse(c.sync.get('blocked')),['Acme']);assert.deepEqual(JSON.parse(c.sync.get('blockedKw')),['intern']);assert.deepEqual(JSON.parse(c.sync.get('reads')),['ln:456']);}
 a.sync.set('favs','[]');await a.sync.flush();await b.sync.flush();assert.deepEqual(JSON.parse(b.sync.get('favs')),[]);
});
test('offline changes survive reload and a lost acknowledgement cannot replay an old action',async()=>{
 const f=fixture(),a=f.client();await a.sync.flush();a.offline(true);a.sync.set('favs','["ln:123"]');assert.equal(await a.sync.flush(),false);a.sync.stop();
 const reload=f.client('alpha',a.store);assert.deepEqual(JSON.parse(reload.sync.get('favs')),['ln:123']);reload.loseAck();assert.equal(await reload.sync.flush(),false);
 const b=f.client();await b.sync.flush();b.sync.set('favs','[]');await b.sync.flush();assert.equal(await reload.sync.flush(),true);assert.deepEqual(JSON.parse(reload.sync.get('favs')),[]);assert.equal(f.sql.prepare('SELECT count(*) n FROM account_sync_changes').get().n,2);
});
test('legacy imports once to its first account and respects existing server tombstones',async()=>{
 const f=fixture(),seed=f.client();await seed.sync.flush();seed.sync.set('favs','["ln:gone"]');await seed.sync.flush();seed.sync.set('favs','[]');await seed.sync.flush();
 const store=f.storage({favs:'["ln:gone","ln:keep"]',reads:'["ln:read"]',blocked:'["Acme"]',blockedKw:'["intern"]'}),a=f.client('alpha',store);await a.sync.flush();assert.deepEqual(JSON.parse(a.sync.get('favs')),['ln:keep']);assert.deepEqual(JSON.parse(a.sync.get('reads')),['ln:read']);
 const b=f.client('beta',store);await b.sync.flush();for(const k of ['favs','reads','blocked','blockedKw'])assert.deepEqual(JSON.parse(b.sync.get(k)),[]);
});
test('simultaneous browser tabs preserve both durable outboxes and recover shared state',async()=>{
 const f=fixture(),store=f.storage(),a=f.client('alpha',store),b=f.client('alpha',store);await a.sync.flush();await b.sync.flush();a.sync.set('favs','["ln:a"]');b.sync.set('reads','["ln:b"]');await Promise.all([a.sync.flush(),b.sync.flush()]);await a.sync.flush();await b.sync.flush();assert.deepEqual(JSON.parse(a.sync.get('reads')),['ln:b']);assert.deepEqual(JSON.parse(b.sync.get('favs')),['ln:a']);assert.equal(a.sync.pending().length,0);assert.equal(b.sync.pending().length,0);
});
test('large imports use bounded batches and paginated deltas without losing rows',async()=>{
 const f=fixture(),a=f.client('alpha',f.storage({reads:JSON.stringify(Array.from({length:1105},(_,i)=>'ln:'+i))}));assert.equal(await a.sync.flush(),true);const b=f.client();assert.equal(await b.sync.flush(),true);assert.equal(JSON.parse(b.sync.get('reads')).length,1105);assert.equal(f.sql.prepare('SELECT count(*) n FROM account_sync_changes').get().n,1105);
});

test('application history survives offline reload, two-device merging and favorite removal; accounts stay isolated',async()=>{
 const f=fixture(),a=f.client(),b=f.client();await a.sync.flush();await b.sync.flush();
 const event=(id,stage,path,time)=>JSON.stringify({v:1,id,j:'ln:123',s:stage,p:path,t:time});
 const applied=event('applied_event_123456','applied',['applied'],100),first=event('first_event_12345678','first',['applied','first'],200);
 a.offline(true);a.sync.set('applications',JSON.stringify([applied]));a.sync.stop();
 b.sync.set('applications',JSON.stringify([first]));await b.sync.flush();
 const reload=f.client('alpha',a.store);assert.equal(await reload.sync.flush(),true);await b.sync.flush();
 for(const c of [reload,b])assert.deepEqual(new Set(JSON.parse(c.sync.get('applications'))),new Set([applied,first]));
 reload.sync.set('favs','["ln:123"]');await reload.sync.flush();reload.sync.set('favs','[]');await reload.sync.flush();
 assert.equal(JSON.parse(reload.sync.get('applications')).length,2);
 const beta=f.client('beta',a.store);await beta.sync.flush();assert.deepEqual(JSON.parse(beta.sync.get('applications')),[]);
});

test('invalid or destructive application events fail before database writes',async()=>{
 const f=fixture();const send=operations=>preferences(new Request('https://site.test/auth/preferences',{method:'POST',headers:{origin:'https://site.test','x-csrf-token':'csrf-alpha','content-type':'application/json'},body:JSON.stringify({operations})}),{AUTH_ORIGIN:'https://site.test',AUTH_DB:f.db},{user_id:'alpha',csrf:'csrf-alpha'});
 for(const item of ['{}',JSON.stringify({v:1,id:'valid_event_123456',j:'ln:123',s:'offer',p:['first'],t:100})])assert.equal((await send([{id:'operation_12345678',kind:'applications',item,present:true}])).status,400);
 const item=JSON.stringify({v:1,id:'valid_event_123456',j:'ln:123',s:'applied',p:['applied'],t:100});
 assert.equal((await send([{id:'operation_12345678',kind:'applications',item,present:false}])).status,400);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM account_sync_changes').get().n,0);
});

test('contact and no-response history with region snapshots synchronizes between devices without a migration',async()=>{
 const f=fixture(),a=f.client(),b=f.client();await a.sync.flush();
 const entries=[
  {v:1,id:'applied_contact_1234',j:'ln:123',s:'applied',p:['applied'],t:100,r:'HK'},
  {v:1,id:'recruiter_contact_123',j:'ln:123',s:'contact',p:['applied','contact'],t:200,r:'HK'},
  {v:1,id:'no_response_contact_1',j:'ln:123',s:'no_response',p:['applied','contact'],t:300,r:'HK'}
 ].map(JSON.stringify);
 a.sync.set('applications',JSON.stringify(entries));assert.equal(await a.sync.flush(),true);assert.equal(await b.sync.flush(),true);
 assert.deepEqual(new Set(JSON.parse(b.sync.get('applications'))),new Set(entries));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM account_sync_items WHERE kind='applications'").get().n,3);
});


test('favorite employer observations synchronize privately without altering favorites or stage history',async()=>{
 const f=fixture(),a=f.client(),b=f.client();await a.sync.flush();await b.sync.flush();
 const item=JSON.stringify({v:1,j:'ln:123',k:'direct_employer',t:100});
 a.offline(true);a.sync.set('favs','["ln:123"]');a.sync.set('favoriteTypes',JSON.stringify([item]));a.sync.stop();
 const reload=f.client('alpha',a.store);assert.equal(await reload.sync.flush(),true);assert.equal(await b.sync.flush(),true);
 assert.deepEqual(JSON.parse(b.sync.get('favoriteTypes')),[item]);assert.deepEqual(JSON.parse(b.sync.get('applications')),[]);
 reload.sync.set('favs','[]');await reload.sync.flush();await b.sync.flush();
 assert.deepEqual(JSON.parse(b.sync.get('favoriteTypes')),[item]);assert.deepEqual(JSON.parse(b.sync.get('favs')),[]);
 const other=f.client('beta',a.store);await other.sync.flush();assert.deepEqual(JSON.parse(other.sync.get('favoriteTypes')),[]);
 const send=operation=>preferences(new Request('https://site.test/auth/preferences',{method:'POST',headers:{origin:'https://site.test','x-csrf-token':'csrf-alpha','content-type':'application/json'},body:JSON.stringify({operations:[operation]})}),{AUTH_ORIGIN:'https://site.test',AUTH_DB:f.db},{user_id:'alpha',csrf:'csrf-alpha'});
 for(const [bad,present] of [[JSON.stringify({v:1,j:'ln:123',k:'fake',t:100}),true],[item,false]])assert.equal((await send({id:'favorite_test_op_1234',kind:'favoriteTypes',item:bad,present})).status,400);
});

test('a confirmed replacement inherits one favorite and its journey from every ID in the chain',async()=>{
 const f=fixture(),a=f.client(),b=f.client(),other=f.client('beta');
 const old='ln:1234567',middle='ln:1234568',current='ln:1234569',unrelated='ln:1234570';
 const stage={v:1,id:'before_replacement_123',j:middle,s:'first',p:['applied','first'],t:100,r:'HK'};
 const type={v:1,j:old,k:'direct_employer',t:100};
 a.sync.set('favs',JSON.stringify([old,middle,unrelated]));
 a.sync.set('applications',JSON.stringify([JSON.stringify(stage)]));
 a.sync.set('favoriteTypes',JSON.stringify([JSON.stringify(type)]));
 a.sync.set('reads',JSON.stringify([old]));
 await a.sync.flush();await b.sync.flush();
 const replacements={[old]:middle,[middle]:current};
 for(const client of [a,b,other])client.sync.setJobReplacements(replacements);
 for(const client of [a,b]){
  const lists=JSON.parse(JSON.stringify(client.sync.snapshot()));
  assert.deepEqual(lists.favs,[current,unrelated]);
  assert.deepEqual(lists.applications.map(JSON.parse),[{...stage,j:current}]);
  assert.deepEqual(lists.favoriteTypes.map(JSON.parse),[{...type,j:current}]);
  assert.deepEqual(lists.reads,[old]);
  assert.equal(client.sync.pending().length,0);
 }
 await other.sync.flush();
 assert.equal(other.sync.snapshot().favs.length,0);

 const nextStage={...stage,id:'after_replacement_1234',j:current,s:'offer',p:['applied','first','offer'],t:200};
 b.sync.set('applications',JSON.stringify([...b.sync.snapshot().applications,JSON.stringify(nextStage)]));
 assert.equal(b.sync.pending().length,1);
 await b.sync.flush();await a.sync.flush();
 assert.equal(a.sync.snapshot().applications.length,2);
 assert.equal(JSON.parse(f.sql.prepare("SELECT item FROM account_sync_items WHERE kind='applications' ORDER BY revision LIMIT 1").get().item).j,middle);
});

test('an offline unstar follows further replacements and stays removed across devices and retries',async()=>{
 const f=fixture(),a=f.client(),b=f.client(),stale=f.client();
 const old='ln:1234567',middle='ln:1234568',current='ln:1234569';
 a.sync.set('favs',JSON.stringify([old]));
 await a.sync.flush();await b.sync.flush();await stale.sync.flush();
 const initial={[old]:middle},next={...initial,[middle]:current};
 a.sync.setJobReplacements(initial);
 a.offline(true);
 assert.equal(a.sync.toggleFavorite(middle),false);
 assert.equal(await a.sync.flush(),false);
 a.sync.stop();

 const reloaded=f.client('alpha',a.store);
 for(const client of [reloaded,b])client.sync.setJobReplacements(next);
 assert.equal(reloaded.sync.snapshot().favs.length,0);
 reloaded.loseAck();
 assert.equal(await reloaded.sync.flush(),false);
 await b.sync.flush();
 assert.equal(b.sync.snapshot().favs.length,0);
 assert.equal(await reloaded.sync.flush(),true);

 assert.equal(stale.sync.toggleFavorite(old),false);
 await stale.sync.flush();await b.sync.flush();
 assert.equal(b.sync.snapshot().favs.length,0);
 assert.equal(b.sync.toggleFavorite(current),true);
 await b.sync.flush();await reloaded.sync.flush();
 assert.deepEqual(JSON.parse(reloaded.sync.get('favs')),[current]);
});
