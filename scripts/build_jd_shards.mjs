import {readFileSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function jdShard(id) {
  let hash=0;
  for(const char of String(id)) hash=(hash*31+char.charCodeAt(0))>>>0;
  return (hash%256).toString(16).padStart(2,'0');
}
export function buildJdShards(source='jobs-details.json', output='jd-parts') {
  const doc=JSON.parse(readFileSync(source,'utf8'));
  if(!doc.details || typeof doc.details!=='object' || Array.isArray(doc.details)) throw Error('Invalid JD payload');
  const buckets=Array.from({length:256},()=>({schemaVersion:doc.schemaVersion,source:doc.source,details:{}}));
  for(const [id,entry] of Object.entries(doc.details)) buckets[parseInt(jdShard(id),16)].details[id]=entry;
  rmSync(output,{recursive:true,force:true});
  mkdirSync(output,{recursive:true});
  const sizes=buckets.map((bucket,i)=>{
    const text=JSON.stringify(bucket)+'\n';
    writeFileSync(resolve(output,i.toString(16).padStart(2,'0')+'.json'),text);
    return Buffer.byteLength(text);
  });
  return {entries:Object.keys(doc.details).length,partitions:256,maxBytes:Math.max(...sizes)};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(buildJdShards()));
