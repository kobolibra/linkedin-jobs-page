import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateRequest, buildProviderRequest, parseProviderResponse, cleanDescription, assessEvidence } from './worker.js';
const input=(extra={})=>({jobId:'li-1',title:'Senior Data Engineer',company:'ACME',location:'HK',description:'Key Responsibilities\nBuild and operate data platforms.\nAnalyse recurring business data and deliver reports.\nWork with stakeholders on reliable services.',...extra});
const v4={schema:'jev-input-v4',jd_text:'Key Responsibilities\nBuild and operate data platforms.\nAnalyse recurring business data and deliver reports.',language:'en',evidence_level:'adequate',evidence_flags:[],employer_metadata:'Business: Corporate Banking'};

test('validates raw and v4 inputs and rejects short text',()=>{assert.equal(validateRequest(input({jevInput:v4})).jevInput.schema,'jev-input-v4');assert.throws(()=>validateRequest({description:'too short'}),/description_required/);assert.throws(()=>validateRequest(null),/invalid_json/);});
test('cleans HTML into block-aware text and removes static boilerplate',()=>{const out=cleanDescription('<h3>Key Responsibilities</h3><p>Build services.</p><p>Equal opportunity employer.</p>');assert.match(out,/Key Responsibilities/);assert.match(out,/Build services/);assert.doesNotMatch(out,/Equal opportunity/);});
test('counts evidence with headings and inline numbered duties',()=>{const ev=assessEvidence('工作职责：1. 负责客户分析。2. 推动项目交付。\n任职要求：本科及以上');assert.notEqual(ev.level,'insufficient');assert.ok(ev.duty>=2);});
test('splits corporate and institutional banking and rejects the old combined bucket',()=>{const req=buildProviderRequest(input({jevInput:{...v4,employer_metadata:'Business: Institutional Banking'}}),{});assert.ok(req.payload.questions.businessLine.criteria.corporate_banking.toLowerCase().includes('large companies'));assert.ok(req.payload.questions.businessLine.criteria.institutional_banking.toLowerCase().includes('financial institutions'));assert.ok(req.payload.questions.businessLine.instructions.includes('Transaction banking'));const corporate=parseProviderResponse({answers:{businessLine:{type:'choice',choice:'corporate_banking',confidence:.9}}},input({jevInput:v4}));const institutional=parseProviderResponse({answers:{businessLine:{type:'choice',choice:'institutional_banking',confidence:.9}}},input({jevInput:v4}));const legacy=parseProviderResponse({answers:{businessLine:{type:'choice',choice:'corporate_and_institutional_banking',confidence:.9}}},input({jevInput:v4}));assert.equal(corporate.businessLine.value,'corporate_banking');assert.equal(institutional.businessLine.value,'institutional_banking');assert.equal(legacy.businessLine.value,'not_stated');});
test('splits primary activity by distinct work product and rejects retired broad codes',()=>{const req=buildProviderRequest(input({jevInput:v4}),{});assert.ok(req.payload.questions.primaryActivity.criteria.data_engineering.toLowerCase().includes('pipelines'));assert.ok(req.payload.questions.primaryActivity.criteria.data_analytics_and_bi.toLowerCase().includes('dashboards'));assert.ok(req.payload.questions.primaryActivity.criteria.data_science_quant_and_modelling.toLowerCase().includes('predictive'));assert.ok(req.payload.questions.primaryActivity.instructions.includes('transaction processing'));const bi=parseProviderResponse({answers:{primaryActivity:{type:'choice',choice:'data_analytics_and_bi',confidence:.9}}},input({jevInput:v4}));const old=parseProviderResponse({answers:{primaryActivity:{type:'choice',choice:'data_analytics_and_modelling',confidence:.9}}},input({jevInput:v4}));assert.equal(bi.primaryActivity.value,'data_analytics_and_bi');assert.equal(old.primaryActivity.value,'not_determinable');});
test('builds compact v4 provider state without redundant specialisation questions',()=>{const req=buildProviderRequest(input({jevInput:v4}),{});assert.equal(req.url,'https://api.typesafe.ai/v1/systemone');assert.equal(req.payload.model,'jev-latest');assert.equal(req.payload.state.jd_text,v4.jd_text);assert.equal(Object.keys(req.payload.questions).length,11);assert.equal(Object.keys(req.payload.questions).some(key=>key.startsWith('specialisation_')),false);assert.equal(req.payload.questions.roleArchetype.type,'choice');assert.equal(req.payload.questions.hasExplicitPeopleManagement.type,'noul');});
test('emits only the five visible dimensions plus evidence metadata',()=>{const r=parseProviderResponse({answers:{postingType:{type:'choice',choice:'specific_role',confidence:.9},roleArchetype:{type:'choice',choice:'TE5_data_engineering_analytics',confidence:.9},primaryActivity:{type:'choice',choice:'data_analytics_and_bi',confidence:.8},businessLine:{type:'choice',choice:'corporate_banking',confidence:.8},leadershipLevel:{type:'choice',choice:'individual_contributor',confidence:.8}}},input({jevInput:v4}));assert.equal(r.taxonomyVersion,'jev-taxonomy-v4.3');assert.equal(r.schemaVersion,6);assert.equal(r.roleArchetype.value,'TE5_data_engineering_analytics');assert.equal(r.primaryActivity.value,'data_analytics_and_bi');assert.equal(r.businessLine.value,'corporate_banking');assert.equal(r.leadershipLevel.value,'individual_contributor');assert.equal(r.roleRisk.flags.length,0);assert.equal(r.operatingContext,undefined);assert.equal(r.servedBusinessLine,undefined);});
test('uses real noul scores and does not allow weak title inference',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'TE1_software_engineering'},leadershipLevel:{type:'choice',choice:'people_manager'},hasExplicitPeopleManagement:{type:'noul',noul:.1},hasExplicitTeamLeadership:{type:'noul',noul:.8}}},input({title:'Head of Engineering',jevInput:v4}));assert.equal(r.leadershipLevel.value,'team_lead');});
test('gates non-job posting to neutral states',()=>{const r=parseProviderResponse({answers:{postingType:{type:'choice',choice:'not_a_job_posting',confidence:.95},roleArchetype:{type:'choice',choice:'TE1_software_engineering'},primaryActivity:{type:'choice',choice:'software_engineering'},businessLine:{type:'choice',choice:'global_markets'},leadershipLevel:{type:'choice',choice:'people_manager'}}},input({jevInput:v4}));assert.equal(r.roleArchetype.value,'not_applicable');assert.equal(r.primaryActivity.state,'not_applicable');assert.equal(r.businessLine.value,'not_applicable');assert.equal(r.leadershipLevel.value,'not_applicable');assert.equal(r.roleRisk.state,'not_applicable');});
test('gates insufficient evidence to neutral role classification',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'TE1_software_engineering'},primaryActivity:{type:'choice',choice:'software_engineering'}}},input({jevInput:{...v4,evidence_level:'insufficient'}}));assert.equal(r.roleArchetype.value,'insufficient_evidence');assert.equal(r.primaryActivity.value,'not_determinable');});
test('derives five risk labels from provider and text signals',()=>{const r=parseProviderResponse({answers:{riskTitleFunctionMismatch:{type:'noul',noul:.9},riskOverloadedScope:{type:'noul',noul:.9},riskNonPermanent:{type:'noul',noul:.1},riskGenericTemplate:{type:'noul',noul:.1}}},input({description:'This is a fixed-term 12 month contract with many unrelated duties.',jevInput:v4}));assert.ok(r.roleRisk.flags.some(x=>x.code==='title_function_mismatch'));assert.ok(r.roleRisk.flags.some(x=>x.code==='overloaded_scope'));assert.ok(r.roleRisk.flags.some(x=>x.code==='non_permanent_or_outsourced'));});
test('fallback activity is explicit and bounded',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'other_profession'}}},input({jevInput:v4}));assert.equal(r.primaryActivity.value,'not_determinable');});
test('returns 503 without leaking provider credentials',async()=>{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example'},body:JSON.stringify(input())}),{ASSETS:{fetch:async()=>new Response('asset')}});assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'provider_not_configured'});});
test('rejects direct API calls without same-origin Origin',async()=>{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input())}),{TYPESAFE_API_KEY:'test-secret',ASSETS:{fetch:async()=>new Response('asset')}});assert.equal(res.status,403);});
test('proxies provider response without exposing key and serves assets',async()=>{const old=globalThis.fetch;let req;globalThis.fetch=async(url,init)=>{req={url,init};return new Response(JSON.stringify({answers:{roleArchetype:{type:'choice',choice:'CF1_finance_accounting'},primaryActivity:{type:'choice',choice:'finance_accounting_and_control'}}}),{status:200});};try{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example'},body:JSON.stringify(input())}),{TYPESAFE_API_KEY:'test-secret',ASSETS:{fetch:async()=>new Response('asset')}});const body=await res.json();assert.equal(res.status,200);assert.equal(req.url,'https://api.typesafe.ai/v1/systemone');assert.equal(req.init.headers.authorization,'Bearer test-secret');assert.equal(body.analysis.roleArchetype.value,'CF1_finance_accounting');assert.doesNotMatch(JSON.stringify(body),/test-secret/);}finally{globalThis.fetch=old;}});
test('serves homepage uncached and static assets normally',async()=>{const asset=new Response('<!doctype html>',{headers:{'cache-control':'public,max-age=3600'}});const res=await worker.fetch(new Request('https://linkedin.example/'),{ASSETS:{fetch:async()=>asset}});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);});

test('all gated dimensions keep code, value and label consistent',()=>{
  const choice=value=>({type:'choice',choice:value,confidence:.95});
  const answers={postingType:choice('specific_role'),roleArchetype:choice('TE1_software_engineering'),primaryActivity:choice('software_engineering'),businessLine:choice('global_markets'),leadershipLevel:choice('people_manager'),hasExplicitPeopleManagement:{type:'noul',noul:.1},hasExplicitTeamLeadership:{type:'noul',noul:.8}};
  const cases=[
    {answers,level:'adequate',role:'TE1_software_engineering',lead:'team_lead'},
    {answers:{...answers,hasExplicitTeamLeadership:{type:'noul',noul:.1}},level:'adequate',role:'TE1_software_engineering',lead:'individual_contributor'},
    {answers:{...answers,postingType:choice('not_a_job_posting')},level:'adequate',role:'not_applicable',lead:'not_applicable'},
    {answers,level:'insufficient',role:'insufficient_evidence',lead:'not_applicable'},
    {answers:{...answers,leadershipLevel:choice('not_stated'),hasExplicitPeopleManagement:{type:'noul',noul:.9}},level:'adequate',role:'TE1_software_engineering',lead:'people_manager'},
  ];
  for(const c of cases){
    const r=parseProviderResponse({answers:c.answers},input({jevInput:{...v4,evidence_level:c.level}}));
    assert.equal(r.roleArchetype.value,c.role);
    assert.equal(r.leadershipLevel.value,c.lead);
    for(const key of ['postingType','roleArchetype','primaryActivity','businessLine','leadershipLevel']){
      assert.equal(r[key].code,r[key].value,key);
      assert.ok(r[key].label,key);
    }
  }
});

test('HTTP success without any usable provider answers returns an uncached error',async()=>{
  const old=globalThis.fetch;
  const cases=[{},null,[],{usage:{total_tokens:123}},{answers:{}},{answers:{roleArchetype:{}}},{answers:{roleArchetype:{type:'choice',choice:'unknown_code'}}},{answers:{riskNonPermanent:{type:'noul',noul:2}}},{choices:[{message:{content:'No answer available'}}]},{choices:[{message:{content:'{}'}}]}];
  try{
    for(const [i,payload] of cases.entries()){
      globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200});
      const request=new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example','CF-Connecting-IP':`empty-case-${i}`},body:JSON.stringify(input({jevInput:v4}))});
      const res=await worker.fetch(request,{TYPESAFE_API_KEY:'test-secret'});
      assert.equal(res.status,502,JSON.stringify(payload));
      assert.deepEqual(await res.json(),{error:'provider_error'});
      assert.equal(res.headers.get('cache-control'),'no-store');
    }
  }finally{globalThis.fetch=old;}
});

test('supported direct, wrapped and partial provider answers remain successful',async()=>{
  const old=globalThis.fetch;
  const answers={roleArchetype:{type:'choice',choice:'TE1_software_engineering',confidence:.9}};
  const cases=[answers,{answers},{analysis:answers},{result:answers},{choices:[{message:{content:JSON.stringify({answers})}}]},{choices:[{message:{tool_calls:[{function:{arguments:JSON.stringify({answers})}}]}}]}];
  try{
    for(const [i,payload] of cases.entries()){
      globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200});
      const request=new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example','CF-Connecting-IP':`valid-case-${i}`},body:JSON.stringify(input({jevInput:v4}))});
      const res=await worker.fetch(request,{TYPESAFE_API_KEY:'test-secret'});
      assert.equal(res.status,200,JSON.stringify(payload));
      const body=await res.json();
      assert.equal(body.analysis.roleArchetype.code,'TE1_software_engineering');
      assert.equal(body.analysis.leadershipLevel.code,body.analysis.leadershipLevel.value);
    }
  }finally{globalThis.fetch=old;}
});

test('provider HTTP failures and malformed JSON keep their error behavior',async()=>{
  const old=globalThis.fetch;
  try{
    for(const [status,body,expected] of [[200,'not JSON',502],[500,'{}',502],[402,'{}',402],[429,'{}',429],[401,'{}',503]]){
      globalThis.fetch=async()=>new Response(body,{status});
      const request=new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example','CF-Connecting-IP':`failure-case-${status}`},body:JSON.stringify(input())});
      const res=await worker.fetch(request,{TYPESAFE_API_KEY:'test-secret'});
      assert.equal(res.status,expected);
      assert.equal((await res.json()).analysis,undefined);
    }
  }finally{globalThis.fetch=old;}
});
