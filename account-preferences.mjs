/* Server-only per-item synchronization. Tombstones prevent deleted items returning. */
const KINDS=new Set(['favs','blocked','blockedKw','reads','applications','favoriteTypes']);
// Immutable, account-private stage events fit the existing per-item sync protocol.
export function validApplicationItem(item){
 try{const e=JSON.parse(item),stages=['applied','contact','first','second','final','offer'];
  return e?.v===1&&typeof e.id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(e.id)&&typeof e.j==='string'&&e.j.trim()===e.j&&e.j.length>0&&e.j.length<=300&&!/[\u0000-\u001f\u007f]/.test(e.j)&&Number.isSafeInteger(e.t)&&e.t>=0&&e.t<=8640000000000000&&(e.r===undefined||['CN','HK','SG','OTHER','UNKNOWN'].includes(e.r))&&Array.isArray(e.p)&&e.p.length<=stages.length&&e.p.every((s,i)=>stages.includes(s)&&(i===0||stages.indexOf(s)>stages.indexOf(e.p[i-1])))&&(e.s==='saved'?e.p.length===0:['rejected','no_response'].includes(e.s)||(stages.includes(e.s)&&e.p.at(-1)===e.s));
 }catch{return false;}
}
// Immutable observations are independent of application stage history.
export function validFavoriteTypeItem(item){
 try{const e=JSON.parse(item);return e?.v===1&&typeof e.j==='string'&&e.j.trim()===e.j&&e.j.length>0&&e.j.length<=300&&!/[\u0000-\u001f\u007f]/.test(e.j)&&['direct_employer','recruitment_agency','recruitment_platform','mixed','unknown','unlisted'].includes(e.k)&&Number.isSafeInteger(e.t)&&e.t>=0&&e.t<=8640000000000000;}catch{return false;}
}
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'}});
async function body(request){
 const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0,text='';const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>60000){await reader.cancel();throw Error('size');}text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{reader.releaseLock();}
}
export async function preferences(request,env,user){
 const db=env.AUTH_DB.withSession?env.AUTH_DB.withSession('first-primary'):env.AUTH_DB;
 if(request.method==='GET'){
  const raw=new URL(request.url).searchParams.get('since')||'0';if(!/^\d{1,16}$/.test(raw)||!Number.isSafeInteger(Number(raw)))return reply(400,{error:'invalid_cursor'});
  const rows=(await db.prepare('SELECT kind,item,present,revision FROM account_sync_items WHERE user_id=? AND revision>? ORDER BY revision LIMIT 1001').bind(user.user_id,Number(raw)).all()).results;
  const entries=rows.slice(0,1000);return reply(200,{userId:user.user_id,entries,cursor:entries.at(-1)?.revision||Number(raw),more:rows.length>1000});
 }
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(request.headers.get('origin')!==env.AUTH_ORIGIN||request.headers.get('x-csrf-token')!==user.csrf)return reply(403,{error:'csrf_failed'});
 let data;try{data=await body(request);}catch(e){return reply(e.message==='size'?413:400,{error:'invalid_body'});}
 const ops=data?.operations;if(!Array.isArray(ops)||!ops.length||ops.length>100||ops.some(o=>!o||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(o.id)||!KINDS.has(o.kind)||typeof o.item!=='string'||!o.item.trim()||o.item.length>500||/[\u0000-\u001f\u007f]/.test(o.item)||typeof o.present!=='boolean')||new Set(ops.map(o=>o.id)).size!==ops.length)return reply(400,{error:'invalid_operations'});
 if(ops.some(o=>o.kind==='applications'&&(!o.present||!validApplicationItem(o.item))))return reply(400,{error:'invalid_application_event'});
 if(ops.some(o=>o.kind==='favoriteTypes'&&(!o.present||!validFavoriteTypeItem(o.item))))return reply(400,{error:'invalid_favorite_type'});
 const stamp=Math.floor(Date.now()/1000),bucket='sync:'+user.user_id+':'+Math.floor(stamp/600);
 const rate=await db.prepare('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,stamp+1200).first();
 if(rate.count>180)return reply(429,{error:'sync_rate_limited'});
 const encoded=JSON.stringify(ops);
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO account_sync_changes(user_id,operation_id,kind,item,present) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.item'),json_extract(value,'$.present') FROM json_each(?)").bind(user.user_id,encoded),
  db.prepare("INSERT INTO account_sync_items(user_id,kind,item,present,revision) SELECT user_id,kind,item,present,revision FROM account_sync_changes WHERE user_id=? AND operation_id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) ORDER BY revision ON CONFLICT(user_id,kind,item) DO UPDATE SET present=excluded.present,revision=excluded.revision WHERE excluded.revision>account_sync_items.revision").bind(user.user_id,encoded)
 ]);
 return reply(200,{userId:user.user_id,acknowledged:ops.map(o=>o.id)});
}

