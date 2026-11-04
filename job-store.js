/* Reuse complete snapshots only after confirming the current deployment version. */
(()=>{
// Allow a slow but progressing transfer; abort idle connections and cap total time.
async function fetchJobsIndex({attemptTimeouts=[45000,15000],idleTimeout=20000,connectTimeout=10000,retryDelay=350}={}){
  let lastError;
  for(let attempt=0;attempt<attemptTimeouts.length;attempt++){
    const controller=new AbortController();
    let timer,idleTimer,connectTimer,armIdle;
    const timeout=new Promise((_,reject)=>{
      const fail=()=>{controller.abort();reject(new Error("jobs-index.json timeout"));};
      timer=setTimeout(fail,attemptTimeouts[attempt]);
      // Fail an unresponsive connection promptly, while allowing a progressing
      // download to finish within the separate overall attempt budget.
      connectTimer=setTimeout(fail,connectTimeout);
      armIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(fail,idleTimeout);};
    });
    try{
      return await Promise.race([
        (async()=>{
          const response=await fetch(document.documentElement.dataset.authState==='guest'?"/api/public-preview":"jobs-index.json",{cache:"no-cache",signal:controller.signal});
          clearTimeout(connectTimer);
          if(!response.ok)throw Object.assign(new Error("jobs-index.json HTTP "+response.status),{status:response.status});
          armIdle();
          if(!response.body?.getReader)return response.json();
          const reader=response.body.getReader(),decoder=new TextDecoder();
          let text="";
          try{
            while(true){
              const {done,value}=await reader.read();
              if(done)break;
              if(value?.byteLength){armIdle();text+=decoder.decode(value,{stream:true});}
            }
            return JSON.parse(text+decoder.decode());
          }finally{reader.releaseLock();}
        })(),
        timeout,
      ]);
    }catch(error){
      lastError=error;
      if(error.status===401||error.status===403||error.status===404)throw error;
    }finally{clearTimeout(timer);clearTimeout(idleTimer);clearTimeout(connectTimer);}
    if(attempt+1<attemptTimeouts.length)await new Promise(resolve=>setTimeout(resolve,retryDelay));
  }
  throw lastError;
}

const valid=doc=>doc&&Array.isArray(doc.jobs)&&typeof doc.dataVersion==='string'&&/^[a-f0-9]{64}$/.test(doc.dataVersion);
function database(){return new Promise(resolve=>{let finished=false;const done=db=>{if(finished){db?.close();return;}finished=true;resolve(db);};const timer=setTimeout(()=>done(null),350);try{const req=indexedDB.open('linkedin-job-index',1);req.onupgradeneeded=()=>req.result.createObjectStore('snapshots');req.onsuccess=()=>{clearTimeout(timer);done(req.result);};req.onerror=req.onblocked=()=>{clearTimeout(timer);done(null);};}catch{clearTimeout(timer);done(null);}});}
async function read(){const db=await database();if(!db)return null;return new Promise(resolve=>{let finished=false;const done=doc=>{if(finished)return;finished=true;clearTimeout(timer);db.close();resolve(valid(doc)?doc:null);};const timer=setTimeout(()=>done(null),350);try{const req=db.transaction('snapshots').objectStore('snapshots').get('latest');req.onsuccess=()=>done(req.result);req.onerror=()=>done(null);}catch{done(null);}});}
async function save(doc){if(!valid(doc))return;const db=await database();if(!db)return;try{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(doc,'latest');tx.oncomplete=tx.onerror=tx.onabort=()=>db.close();}catch{db.close();}}
async function version(){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);try{const response=await fetch('jobs-version.json',{cache:'no-cache',signal:controller.signal});if(!response.ok)return null;const doc=await response.json();return /^[a-f0-9]{64}$/.test(doc?.dataVersion)?doc.dataVersion:null;}catch{return null;}finally{clearTimeout(timer);}}
window.JobIndexStore={fetch:fetchJobsIndex,async load(fetcher=fetchJobsIndex){
 // Guest preview never reads or writes the authenticated index snapshot.
 if(document.documentElement.dataset.authState==='guest')return fetcher();
 // A tiny version check and local disk read are independent; overlap them.
 const current=version();
 const cached=await read();
 if(cached&&await current===cached.dataVersion)return cached;
 const doc=await fetcher();save(doc).catch(()=>{});return doc;
}};
})();

