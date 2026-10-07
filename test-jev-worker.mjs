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
test('builds compact v4 provider state without redundant specialisation questions',()=>{const req=buildProviderRequest(input({jevInput:v4}),{});assert.equal(req.url,'https://api.typesafe.ai/v1/systemone');assert.equal(req.payload.model,'jev-latest');assert.equal(Object.values(req.payload.state.jd_blocks).join("\n"),v4.jd_text);assert.equal(Object.keys(req.payload.questions).length,20);assert.equal(Object.keys(req.payload.questions).some(key=>key.startsWith('specialisation_')),false);assert.equal(req.payload.questions.roleArchetype.type,'choice');assert.equal(req.payload.questions.hasExplicitPeopleManagement.type,'noul');});
test('emits only the five visible dimensions plus evidence metadata',()=>{const r=parseProviderResponse({answers:{postingType:{type:'choice',choice:'specific_role',confidence:.9},roleArchetype:{type:'choice',choice:'TE5_data_engineering',confidence:.9},primaryActivity:{type:'choice',choice:'data_analytics_and_bi',confidence:.8},businessLine:{type:'choice',choice:'corporate_banking',confidence:.8},leadershipLevel:{type:'choice',choice:'individual_contributor',confidence:.8}}},input({jevInput:v4}));assert.equal(r.taxonomyVersion,'jev-taxonomy-v4.4');assert.equal(r.schemaVersion,6);assert.equal(r.roleArchetype.value,'TE5_data_engineering');assert.equal(r.primaryActivity.value,'data_analytics_and_bi');assert.equal(r.businessLine.value,'corporate_banking');assert.equal(r.leadershipLevel.value,'individual_contributor');assert.equal(r.roleRisk.flags.length,0);assert.equal(r.operatingContext,undefined);assert.equal(r.servedBusinessLine,undefined);});
test('uses real noul scores and does not allow weak title inference',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'TE1_software_engineering'},leadershipLevel:{type:'choice',choice:'people_manager'},hasExplicitPeopleManagement:{type:'noul',noul:.1},hasExplicitTeamLeadership:{type:'noul',noul:.8},leadershipLevelEvidence:{type:'choice',choice:'b2',confidence:.95}}},input({title:'Head of Engineering',jevInput:v4}));assert.equal(r.leadershipLevel.value,'team_lead');});
test('gates non-job posting to neutral states',()=>{const r=parseProviderResponse({answers:{postingType:{type:'choice',choice:'not_a_job_posting',confidence:.95},roleArchetype:{type:'choice',choice:'TE1_software_engineering'},primaryActivity:{type:'choice',choice:'software_engineering'},businessLine:{type:'choice',choice:'global_markets'},leadershipLevel:{type:'choice',choice:'people_manager'}}},input({jevInput:v4}));assert.equal(r.roleArchetype.value,'not_applicable');assert.equal(r.primaryActivity.state,'not_applicable');assert.equal(r.businessLine.value,'not_applicable');assert.equal(r.leadershipLevel.value,'not_applicable');assert.equal(r.roleRisk.state,'not_applicable');});
test('gates insufficient evidence to neutral role classification',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'TE1_software_engineering'},primaryActivity:{type:'choice',choice:'software_engineering'}}},input({jevInput:{...v4,evidence_level:'insufficient'}}));assert.equal(r.roleArchetype.value,'insufficient_evidence');assert.equal(r.primaryActivity.value,'not_determinable');});
test('structural risk requires both model support and selected source evidence',()=>{
  const source=input({description:'This role is a fixed-term 12 month assignment.\nOwn software development, legal advice and product sales without defined priorities.',jevInput:null});
  const answers={riskTitleFunctionMismatch:{type:'noul',noul:.9},riskTitleEvidence:{type:'choice',choice:'b2',confidence:.9},riskOverloadedScope:{type:'noul',noul:.9},riskScopeEvidence:{type:'choice',choice:'b2',confidence:.9},riskNonPermanent:{type:'noul',noul:.95},riskEmploymentEvidence:{type:'choice',choice:'b1',confidence:.9}};
  const r=parseProviderResponse({answers},source);
  for(const code of ['title_function_mismatch','overloaded_scope','non_permanent_or_outsourced'])assert.ok(r.roleRisk.flags.some(x=>x.code===code));
  assert.equal(r.roleRisk.flags.find(x=>x.code==='non_permanent_or_outsourced').evidence[0].quote,'This role is a fixed-term 12 month assignment.');
});
test('fallback activity is explicit and bounded',()=>{const r=parseProviderResponse({answers:{roleArchetype:{type:'choice',choice:'other_profession'}}},input({jevInput:v4}));assert.equal(r.primaryActivity.value,'not_determinable');});
test('returns 503 without leaking provider credentials',async()=>{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example'},body:JSON.stringify(input())}),{ASSETS:{fetch:async()=>new Response('asset')}});assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'provider_not_configured'});});
test('rejects direct API calls without same-origin Origin',async()=>{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input())}),{TYPESAFE_API_KEY:'test-secret',ASSETS:{fetch:async()=>new Response('asset')}});assert.equal(res.status,403);});
test('proxies provider response without exposing key and serves assets',async()=>{const old=globalThis.fetch;let req;globalThis.fetch=async(url,init)=>{req={url,init};return new Response(JSON.stringify({answers:{roleArchetype:{type:'choice',choice:'CF1_finance_accounting'},primaryActivity:{type:'choice',choice:'finance_accounting_and_control'}}}),{status:200});};try{const res=await worker.fetch(new Request('https://linkedin.example/api/jev/analyze',{method:'POST',headers:{'content-type':'application/json',origin:'https://linkedin.example'},body:JSON.stringify(input())}),{TYPESAFE_API_KEY:'test-secret',ASSETS:{fetch:async()=>new Response('asset')}});const body=await res.json();assert.equal(res.status,200);assert.equal(req.url,'https://api.typesafe.ai/v1/systemone');assert.equal(req.init.headers.authorization,'Bearer test-secret');assert.equal(body.analysis.roleArchetype.value,'CF1_finance_accounting');assert.doesNotMatch(JSON.stringify(body),/test-secret/);}finally{globalThis.fetch=old;}});
test('serves homepage uncached and static assets normally',async()=>{const asset=new Response('<!doctype html>',{headers:{'cache-control':'public,max-age=3600'}});const res=await worker.fetch(new Request('https://linkedin.example/'),{ASSETS:{fetch:async()=>asset}});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);});

test('all gated dimensions keep code, value and label consistent',()=>{
  const choice=value=>({type:'choice',choice:value,confidence:.95});
  const answers={postingType:choice('specific_role'),roleArchetype:choice('TE1_software_engineering'),primaryActivity:choice('software_engineering'),businessLine:choice('global_markets'),leadershipLevel:choice('people_manager'),hasExplicitPeopleManagement:{type:'noul',noul:.1},hasExplicitTeamLeadership:{type:'noul',noul:.8},leadershipLevelEvidence:{type:'choice',choice:'b2',confidence:.95}};
  const cases=[
    {answers,level:'adequate',role:'TE1_software_engineering',lead:'team_lead'},
    {answers:{...answers,hasExplicitTeamLeadership:{type:'noul',noul:.1}},level:'adequate',role:'TE1_software_engineering',lead:'not_stated'},
    {answers:{...answers,postingType:choice('not_a_job_posting')},level:'adequate',role:'not_applicable',lead:'not_applicable'},
    {answers,level:'insufficient',role:'insufficient_evidence',lead:'not_stated'},
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

// These tests exercise runtime safeguards with adversarial/partial provider
// outputs. They do not pretend to measure the model's classification accuracy.
const ch=(choice,confidence=.95)=>({type:'choice',choice,confidence});
const nl=noul=>({type:'noul',noul});
const evidenceInput=description=>input({description,jevInput:{...v4,jd_text:description}});

test('primary activity remains independent of role archetype and missing confidence',()=>{
  for(const confidence of [undefined,.9]){
    const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering'),primaryActivity:{type:'choice',choice:'data_analytics_and_bi',confidence}}},input({jevInput:v4}));
    assert.equal(r.primaryActivity.value,'data_analytics_and_bi');
  }
  const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering')}},input({jevInput:v4}));
  assert.equal(r.primaryActivity.value,'not_determinable');
  const weak=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering'),primaryActivity:ch('data_analytics_and_bi',.1)}},input({jevInput:v4}));
  assert.equal(weak.primaryActivity.value,'not_determinable');
  assert.equal(weak.primaryActivity.confidence,null);
});

test('sparse management evidence never becomes an asserted individual contributor',()=>{
  for(const level of ['not_stated','people_manager','manager_of_managers','team_lead']){
    const r=parseProviderResponse({answers:{leadershipLevel:ch(level)}},input({title:'Managing Director',jevInput:v4}));
    assert.equal(r.leadershipLevel.value,'not_stated');
    assert.equal(r.leadershipLevel.confidence,null);
  }
});

test('manager of managers needs subordinate-manager evidence and clears rejected confidence',()=>{
  const i=evidenceInput('Manage three team leaders, each with direct reports.\nOwn hiring and performance reviews for the team leaders.');
  const answers={leadershipLevel:ch('manager_of_managers'),leadershipLevelEvidence:ch('b1'),hasExplicitPeopleManagement:nl(.95),hasExplicitTeamLeadership:nl(.95)};
  const downgrade=parseProviderResponse({answers},i);
  assert.equal(downgrade.leadershipLevel.value,'people_manager');
  assert.equal(downgrade.leadershipLevel.state,'conflicting');
  assert.equal(downgrade.leadershipLevel.confidence,null);
  const confirmed=parseProviderResponse({answers:{...answers,hasExplicitManagerOfManagers:nl(.95)}},i);
  assert.equal(confirmed.leadershipLevel.value,'manager_of_managers');
  assert.equal(confirmed.leadershipLevel.evidence[0].quote,i.description.split('\n')[0]);
  const ambiguous=parseProviderResponse({answers:{...answers,hasExplicitPeopleManagement:nl(.5),hasExplicitTeamLeadership:nl(.5)}},i);
  assert.equal(ambiguous.leadershipLevel.value,'not_stated');
});

test('risk keywords, negation and alternative locations never trigger deterministic flags',()=>{
  for(const text of [
    'Draft and negotiate client contracts.\nOversee outsourced service providers and vendor controls.',
    'This is a permanent role, not a temporary position.\nCoordinate projects in various locations.',
    '负责外包供应商管理和合同审核。\n这个岗位为正式编制，不是劳务派遣。',
    'Multiple openings for the same data engineering role across several locations.\nBuild data pipelines and improve quality.'
  ]){
    const r=parseProviderResponse({answers:{postingType:ch('specific_role'),riskNonPermanent:nl(.02),riskGenericTemplate:nl(.01),riskTitleFunctionMismatch:nl(.01),riskOverloadedScope:nl(.01)}},evidenceInput(text));
    assert.equal(r.roleRisk.flags.length,0,text);
    assert.equal(r.roleRisk.state,'none');
  }
});

test('employment risk requires selected employment evidence, including explicit title terms',()=>{
  const i=evidenceInput('Build and maintain data pipelines.\nImprove production data quality.');i.title='Data Engineer — 12-month fixed-term contract';
  const unsupported=parseProviderResponse({answers:{riskNonPermanent:nl(.99),riskEmploymentEvidence:ch('does-not-exist')}},i);
  assert.equal(unsupported.roleRisk.flags.length,0);
  assert.equal(unsupported.roleRisk.state,'not_stated');
  const supported=parseProviderResponse({answers:{riskNonPermanent:nl(.99),riskEmploymentEvidence:ch('title')}},i);
  assert.equal(supported.roleRisk.flags[0].code,'non_permanent_or_outsourced');
  assert.equal(supported.roleRisk.flags[0].evidence[0].quote,i.title);
  assert.equal(supported.roleRisk.flags[0].probability,.99);
});

test('pool detection uses posting type, not number of seats or generic-template score',()=>{
  const i=evidenceInput('Join our talent pool for future vacancies.\nWe are collecting profiles for future opportunities.');
  const r=parseProviderResponse({answers:{postingType:ch('talent_pool_or_evergreen'),postingEvidence:ch('b1')}},i);
  assert.ok(r.roleRisk.flags.some(x=>x.code==='pooled_or_multi_role_posting'));
  for(const value of ['specific_role','programme_intake']){
    const other=parseProviderResponse({answers:{postingType:ch(value),postingEvidence:ch('b1'),riskGenericTemplate:nl(.99)}},i);
    assert.equal(other.roleRisk.flags.some(x=>x.code==='pooled_or_multi_role_posting'),false);
  }
});

test('invalid probability and candidate data cannot manufacture confidence or unknown codes',()=>{
  for(const confidence of [NaN,Infinity,2,-1]){
    const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering',confidence),riskNonPermanent:nl(confidence),riskEmploymentEvidence:ch('b2')}},input({jevInput:v4}));
    assert.equal(r.roleArchetype.confidence,null);
    assert.equal(r.roleRisk.flags.length,0);
  }
  const r=parseProviderResponse({answers:{primaryActivity:{...ch('data_analytics_and_bi'),probabilities:{data_analytics_and_bi:.48,data_engineering:.46,unknown:.9,software_engineering:NaN}}}},input({jevInput:v4}));
  assert.equal(r.primaryActivity.state,'conflicting');
  assert.deepEqual(r.primaryActivity.candidates.map(x=>x.label),['Analytics, Metrics & BI','Data Pipelines & Platforms']);
});

test('new narrow professions reject ambiguous retired role codes',()=>{
  for(const code of ['TE5_data_engineering_analytics','TE6_ai_ml_quant','RC3_compliance_legal','CS6_markets_sales_trading','CF6_actuarial_insurance_technical']){
    const r=parseProviderResponse({answers:{roleArchetype:ch(code)}},input({jevInput:v4}));
    assert.equal(r.roleArchetype.value,'insufficient_evidence');
    assert.equal(r.roleArchetype.confidence,null);
  }
});

test('non-job gates clear seemingly strong evidence and alternatives',()=>{
  const r=parseProviderResponse({answers:{postingType:ch('not_a_job_posting'),roleArchetype:{...ch('TE5_data_engineering'),probabilities:{TE5_data_engineering:.9}},roleArchetypeEvidence:ch('b2'),riskNonPermanent:nl(.99),riskEmploymentEvidence:ch('b2')}},input({jevInput:v4}));
  assert.equal(r.roleArchetype.confidence,null);
  assert.deepEqual(r.roleArchetype.evidence,[]);
  assert.deepEqual(r.roleArchetype.candidates,[]);
  assert.equal(r.roleRisk.state,'not_applicable');
  assert.equal(r.roleRisk.flags.length,0);
});

test('real vacancy does not use not-applicable as a missing-information category',()=>{
  const r=parseProviderResponse({answers:{roleArchetype:ch('not_applicable'),businessLine:ch('not_applicable'),leadershipLevel:ch('not_applicable')}},input({jevInput:v4}));
  assert.equal(r.roleArchetype.value,'insufficient_evidence');
  assert.equal(r.businessLine.value,'not_stated');
  assert.equal(r.leadershipLevel.value,'not_stated');
});

test('thin JD may retain directly evidenced business context without inventing profession',()=>{
  const i=evidenceInput('The position supports Global Markets.');i.jevInput.evidence_level='insufficient';
  const r=parseProviderResponse({answers:{businessLine:ch('global_markets'),businessLineEvidence:ch('b1'),roleArchetype:ch('IR4_trading')}},i);
  assert.equal(r.businessLine.value,'global_markets');
  assert.equal(r.roleArchetype.value,'insufficient_evidence');
  assert.equal(r.leadershipLevel.value,'not_stated');
});

test('source blocks survive HTML, bilingual text, tail terms and bounded choice count',()=>{
  const long=Array.from({length:150},(_,i)=>`Duty ${i}: build services and improve controls.`).join('\n')+'\nEmployment: 12-month fixed-term contract.';
  const req=buildProviderRequest(input({description:long}));
  const blocks=Object.values(req.payload.state.jd_blocks);
  assert.ok(blocks.length<=120);
  assert.ok(blocks.join(' ').includes('Employment: 12-month fixed-term contract.'));
  const html=buildProviderRequest(input({description:'负责数据质量。<br/>Build data platforms.<br />职位为固定期限合同。'}));
  assert.deepEqual(Object.values(html.payload.state.jd_blocks),['负责数据质量。','Build data platforms.','职位为固定期限合同。']);
  for(const question of Object.values(req.payload.questions))if(question.type==='choice')assert.ok(Object.keys(question.criteria).length<=122);
});

test('requirements do not inflate fallback duty evidence',()=>{
  const r=assessEvidence('Requirements:\nTen years experience in banking.\nExcellent English and Mandarin.\nStrong communication and stakeholder skills.\nBachelor degree in computer science.');
  assert.equal(r.level,'insufficient');assert.equal(r.duty,0);assert.ok(r.requirements>=4);
});

test('taxonomy documentation is generated from the current runtime definitions',async()=>{
  const {readFileSync}=await import('node:fs');const {taxonomyMarkdown}=await import('./gen-taxonomy-doc.mjs');
  assert.equal(readFileSync(new URL('./jev-taxonomy-v4.4.md',import.meta.url),'utf8'),taxonomyMarkdown());
});

test('frontend renders evidence safely and distinguishes unknown risk from none',async()=>{
  const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
  const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('function jevPayload('),source.indexOf('function jevErrorMessage('));
  const context={JEV_TAXONOMY_VERSION:'jev-taxonomy-v4.4',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
  runInNewContext(snippet+';this.render=renderJevResult;',context);
  const container={};context.render(container,{roleArchetype:{label:'Data Engineering',evidence:[{source:'jd',quote:'<img src=x onerror="alert(1)">'}]},roleRisk:{flags:[],state:'not_stated'}});
  assert.match(container.innerHTML,/&lt;img/);assert.doesNotMatch(container.innerHTML,/<img/);
  assert.match(container.innerHTML,/Insufficient evidence to assess role risks/);
  assert.equal((container.innerHTML.match(/<dt>/g)||[]).length,4);
  assert.match(container.innerHTML,/<h4>Role Risk<\/h4>/);
  assert.match(source,/if\(normalized.taxonomyVersion===JEV_TAXONOMY_VERSION\)/);
});
