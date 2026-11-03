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

