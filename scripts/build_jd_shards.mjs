import {createHash} from 'node:crypto';
import {readFileSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPublicAssets} from './public_assets.mjs';

export function jdShard(id) {
  let hash=0;
  for(const char of String(id)) hash=(hash*31+char.charCodeAt(0))>>>0;
  return (hash%256).toString(16).padStart(2,'0');
}
// This build runs in both GitHub deployment and Cloudflare Git integration.
// Keep the initial-render catalog fresh in either deployment path.
export function embedCompanyLogos(index='jobs-index.json',manifest='company-logos.json',state='data/company-logos/state.json'){
  if(!existsSync(index))return 0;
  const doc=JSON.parse(readFileSync(index,'utf8')),safe=src=>typeof src==='string'&&/^assets\/company-logos\/[a-f0-9]{24}\.(webp|svg)$/.test(src);
  let catalog={},records={};
  try{catalog=JSON.parse(readFileSync(manifest,'utf8'));}catch{}
  try{records=JSON.parse(readFileSync(state,'utf8'));}catch{}
  doc.companyLogos=catalog&&typeof catalog==='object'&&!Array.isArray(catalog)?Object.fromEntries(Object.entries(catalog).filter(([,src])=>safe(src))):{};
  doc.companyLogoFallback=records&&typeof records==='object'&&!Array.isArray(records)?Object.entries(records).map(([name,record])=>record?.status==='ready'&&record?.imageKind==='placeholder'?doc.companyLogos[name]:null).find(Boolean)||'':'';
  // Presentation URLs retain identity and meaningful query parameters only.
  for(const job of doc.jobs||[]){try{const url=new URL(job.link);if(/(^|\.)linkedin\.com$/i.test(url.hostname)&&['position','pageNum','refId','trackingId'].some(key=>url.searchParams.has(key))){for(const key of ['position','pageNum','refId','trackingId'])url.searchParams.delete(key);job.link=url.href;}}catch{}}
  delete doc.dataVersion;
  doc.dataVersion=createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  writeFileSync(index,JSON.stringify(doc)+'\n');
  writeFileSync(resolve(index,'..','jobs-version.json'),JSON.stringify({dataVersion:doc.dataVersion})+'\n');
  return Object.keys(doc.companyLogos).length;
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
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){embedCompanyLogos();console.log(JSON.stringify(buildJdShards()));console.log('public_assets_verified '+JSON.stringify(buildPublicAssets()));}
