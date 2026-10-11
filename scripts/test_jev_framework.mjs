import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProviderRequest,parseProviderResponse} from '../worker.js';
import {ROLE_FAMILY} from '../jev-taxonomy.mjs';
const ch=(choice,confidence=.95)=>({type:'choice',choice,confidence});
const nl=noul=>({type:'noul',noul});
const job=(description,extra={})=>({title:'Analyst',company:'Bank',location:'CN',description,jevInput:{schema:'jev-input-v4',jd_text:description,evidence_level:'adequate',employer_metadata:''},...extra});
test('profession, work output and decision responsibility can differ independently',()=>{
  const input=job('Build regulatory dashboards and recommend changes to the product owner.\nMaintain the data pipelines supporting those dashboards.');
  const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering'),roleArchetypeEvidence:ch('b2'),primaryActivity:ch('data_analytics_and_bi'),primaryActivityEvidence:ch('b1'),activityMode:ch('advise_recommend'),activityModeEvidence:ch('b1')}},input);
  assert.equal(r.roleArchetype.value,'TE5_data_engineering');assert.equal(r.primaryActivity.value,'data_analytics_and_bi');assert.equal(r.primaryActivity.responsibility.value,'advise_recommend');
  const missing=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering')}},input);
  assert.equal(missing.primaryActivity.value,'not_determinable');assert.equal(missing.primaryActivity.responsibility.value,'not_established');
});
test('assigned business metadata is citable for business but never duties or leadership',()=>{
  const i=job('Build reliable software services.');i.jevInput.employer_metadata='Business: Global Markets\nJob Family: Finance\nEntity: Insurance Company';
  const q=buildProviderRequest(i).payload.questions;
  assert.ok(q.businessLineEvidence.criteria.m1);assert.equal(q.roleArchetypeEvidence.criteria.m1,undefined);assert.equal(q.leadershipLevelEvidence.criteria.m1,undefined);
  const r=parseProviderResponse({answers:{businessLine:ch('not_stated'),roleArchetype:ch('TE1_software_engineering'),roleArchetypeEvidence:ch('m1')}},i);
  assert.equal(r.businessLine.value,'global_markets');assert.equal(r.businessLine.evidence[0].source,'assignment');assert.deepEqual(r.roleArchetype.evidence,[]);
  i.jevInput.employer_metadata='Entity: Global Markets Holdings\nJob Family: Finance';assert.equal(parseProviderResponse({answers:{}},i).businessLine.value,'not_stated');
});
test('actual HSBC standalone CIB heading retains a parent without inventing a client book',()=>{
  const i=job('HSBC Corporate and Institutional Banking(CIB)\nTo prepare and follow up on all documentation relating to credit facilities.\nTo support Relationship Manager in delivering professional service to customers.');i.title='Admin Support Associate';
  const r=parseProviderResponse({answers:{businessLine:ch('not_stated')}},i);
  assert.equal(r.businessLine.value,'corporate_institutional_coverage');assert.equal(r.businessLine.basis,'explicit_source');assert.equal(r.businessLine.confidence,null);assert.equal(r.businessLine.clientSegment.value,'not_established');
  const overSpecific=parseProviderResponse({answers:{businessLine:ch('institutional_banking'),hasExplicitBusinessLine:nl(.99),businessLineEvidence:ch('b1')}},i);
  assert.equal(overSpecific.businessLine.value,'corporate_institutional_coverage');
});
test('employer marketing and contradictory departments cannot establish business assignment',()=>{
  for(const text of ['HSBC Corporate and Institutional Banking provides investment and financial solutions to clients worldwide.','About Corporate and Institutional Banking','We are a leading Corporate and Institutional Banking organisation.']) assert.equal(parseProviderResponse({answers:{}},job(text+'\nMaintain records and reconcile balances.')).businessLine.value,'not_stated');
  const i=job('Maintain records and reconcile balances.');i.jevInput.employer_metadata='Business: Global Markets\nDepartment: Private Banking';assert.equal(parseProviderResponse({answers:{}},i).businessLine.value,'not_stated');
});
test('product line and beneficiary segment are not forced to match',()=>{
  const i=job('Deliver custody and settlement for institutional investor funds.\nReconcile client securities positions.');
  const r=parseProviderResponse({answers:{businessLine:ch('securities_services'),hasExplicitBusinessLine:nl(.99),businessLineEvidence:ch('b1'),clientSegment:ch('financial_public_institutions'),clientSegmentEvidence:ch('b1')}},i);
  assert.equal(r.businessLine.value,'securities_services');assert.equal(r.businessLine.clientSegment.value,'financial_public_institutions');
  assert.equal(parseProviderResponse({answers:{businessLine:ch('securities_services'),hasExplicitBusinessLine:nl(.99)}},i).businessLine.clientSegment.value,'not_established');
});
test('one precise duty can support profession/output without inventing staff authority or a thin-template risk',()=>{
  const i=job('Build SQL ingestion pipelines and maintain warehouse data quality.');i.jevInput.evidence_level='insufficient';
  const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering'),roleArchetypeEvidence:ch('b1'),primaryActivity:ch('data_engineering'),primaryActivityEvidence:ch('b1')}},i);
  assert.equal(r.roleArchetype.value,'TE5_data_engineering');assert.equal(r.primaryActivity.value,'data_engineering');assert.equal(r.leadershipLevel.value,'not_stated');assert.ok(!r.roleRisk.flags.some(x=>x.code==='thin_or_template_jd'));
});
test('qualifications and historical experience do not rescue an insufficient duty mandate',()=>{
  const i=job('Requirements\nTen years of experience managing engineering teams and building data platforms.');i.jevInput.evidence_level='insufficient';
  const r=parseProviderResponse({answers:{roleArchetype:ch('TE5_data_engineering'),roleArchetypeEvidence:ch('b2'),leadershipLevel:ch('people_manager'),leadershipLevelEvidence:ch('b2'),hasExplicitPeopleManagement:nl(.99)}},i);
  assert.equal(r.roleArchetype.value,'insufficient_evidence');assert.equal(r.leadershipLevel.value,'not_stated');
});
test('risk retains employment and two distinct operating facts when structural warning flags are empty',()=>{
  const i=job('This is a permanent position.\nParticipate in a scheduled weekend on-call rota.\nTravel weekly to client sites.');
  const r=parseProviderResponse({answers:{postingType:ch('specific_role'),employmentTerms:ch('permanent'),employmentTermsEvidence:ch('b1'),roleConstraint:ch('on_call_shift'),roleConstraintEvidence:ch('b2'),secondaryRoleConstraint:ch('travel_mobility'),secondaryRoleConstraintEvidence:ch('b3')}},i);
  assert.equal(r.roleRisk.flags.length,0);assert.equal(r.roleRisk.employment.value,'permanent');assert.deepEqual(r.roleRisk.constraints.map(x=>x.value),['on_call_shift','travel_mobility']);assert.ok(!r.roleRisk.clarification.some(x=>x.code==='employment_terms'));
});
test('missing evidence never becomes permanent employment or fabricated conditions; duplicate conditions collapse',()=>{
  const i=job('Maintain services and coordinate stakeholders.');
  const unknown=parseProviderResponse({answers:{employmentTerms:ch('permanent'),roleConstraint:ch('on_call_shift')}},i);
  assert.equal(unknown.roleRisk.employment.value,'not_disclosed');assert.deepEqual(unknown.roleRisk.constraints,[]);assert.equal(unknown.roleRisk.clarification[0].code,'employment_terms');
  const duplicate=parseProviderResponse({answers:{roleConstraint:ch('on_call_shift'),roleConstraintEvidence:ch('b1'),secondaryRoleConstraint:ch('on_call_shift'),secondaryRoleConstraintEvidence:ch('b1')}},job('Participate in the weekend on-call rota.'));
  assert.equal(duplicate.roleRisk.constraints.length,1);
});
test('low-confidence or conflicting inline descriptors retain uncertainty',()=>{
  const i=job('Deliver outputs and coordinate inputs.');
  for(const a of [ch('execute_deliver',.3),{...ch('execute_deliver'),probabilities:{execute_deliver:.45,coordinate_enable:.4}}]) assert.equal(parseProviderResponse({answers:{activityMode:a,activityModeEvidence:ch('b1')}},i).primaryActivity.responsibility.value,'not_established');
});
test('non-job content clears every inline descriptor, operating fact and clarification',()=>{
  const r=parseProviderResponse({answers:{postingType:ch('not_a_job_posting'),employmentTerms:ch('permanent'),employmentTermsEvidence:ch('b1'),roleConstraint:ch('on_call_shift'),roleConstraintEvidence:ch('b1')}},job('This is an event, not a vacancy.'));
  assert.equal(r.roleRisk.employment,null);assert.deepEqual(r.roleRisk.constraints,[]);assert.deepEqual(r.roleRisk.clarification,[]);assert.equal(r.primaryActivity.responsibility,undefined);
});
test('insurance profession family is distinct from generic corporate functions',()=>{
  assert.equal(ROLE_FAMILY.CF6_actuarial,'IN');assert.equal(ROLE_FAMILY.CF8_insurance_underwriting,'IN');assert.equal(ROLE_FAMILY.CF1_finance_accounting,'CF');assert.equal(ROLE_FAMILY.RC7_corporate_investigations,'RC');
});
test('a real citation cannot manufacture an employment term or obligation absent from that passage',()=>{
  const i=job('Draft contracts for clients and support business stakeholders.');
  const r=parseProviderResponse({answers:{employmentTerms:ch('fixed_term'),employmentTermsEvidence:ch('b1'),roleConstraint:ch('on_call_shift'),roleConstraintEvidence:ch('b1')}},i);
  assert.equal(r.roleRisk.employment.value,'not_disclosed');assert.equal(r.roleRisk.constraints.length,0);
});
test('negated fixed-term or permanent wording is not affirmative employment evidence',()=>{
  for(const [description,value] of [['此岗位为无固定期限劳动合同。','fixed_term'],['This is not a fixed-term role.','fixed_term'],['This is not a permanent role.','permanent']]){
    const r=parseProviderResponse({answers:{employmentTerms:ch(value),employmentTermsEvidence:ch('b1')}},job(description));
    assert.equal(r.roleRisk.employment.value,'not_disclosed');
  }
});
test('an explicit technical unit stays useful when commercial business is unknown',()=>{
  const i=job('Build and operate credit and portfolio data pipelines.');i.jevInput.employer_metadata='Business: CTO Data Technology';
  const r=parseProviderResponse({answers:{businessLine:ch('not_stated'),leadershipLevel:ch('individual_contributor'),leadershipLevelEvidence:ch('b1')}},i);
  assert.equal(r.businessLine.value,'not_stated');assert.equal(r.businessLine.assignedUnits[0].label,'CTO Data Technology');assert.equal(r.businessLine.assignedUnits[0].evidence[0].source,'assignment');
  assert.equal(r.roleRisk.clarification.find(x=>x.code==='business_assignment').label,'Confirm the business/products served by this unit');
});
test('technical data delivery alone does not establish own-institution beneficiaries',()=>{
  const r=parseProviderResponse({answers:{clientSegment:ch('own_institution'),clientSegmentEvidence:ch('b1')}},job('Deliver reliable datasets used by KYC, credit and portfolio AI solutions.'));
  assert.equal(r.businessLine.clientSegment.value,'not_established');
});
test('a disclosed contractor duration is preserved and not asked for again',()=>{
  const i=job('Conduct investigations against the Bank and its employees.');i.title='Snr Investigator (6-month contractor)';
  const r=parseProviderResponse({answers:{employmentTerms:ch('contractor'),employmentTermsEvidence:ch('title')}},i);
  assert.equal(r.roleRisk.employment.duration,'6 months');assert.equal(r.roleRisk.clarification[0].label,'Confirm employer and renewal/conversion terms');
});
test('a combined CIB heading does not prove specific institutional clients',()=>{
  const r=parseProviderResponse({answers:{clientSegment:ch('financial_public_institutions'),clientSegmentEvidence:ch('b1')}},job('HSBC Corporate and Institutional Banking(CIB)\nPrepare facility documentation.'));
  assert.equal(r.businessLine.value,'corporate_institutional_coverage');assert.equal(r.businessLine.clientSegment.value,'not_established');
});
test('risk accountability is independently evidenced, not inherited from the profession',()=>{
  const i=job('Ensure client account transactions are completed accurately and reconcile financial records.');
  const supported=parseProviderResponse({answers:{riskExposure:ch('financial_processing_integrity'),riskExposureEvidence:ch('b1')}},i);
  assert.equal(supported.roleRisk.exposure.value,'financial_processing_integrity');assert.equal(supported.roleRisk.exposure.evidence[0].quote,i.description);
  const missing=parseProviderResponse({answers:{roleArchetype:ch('OP1_banking_operations')}},i);
  assert.equal(missing.roleRisk.exposure.value,'not_established');
});
test('the frontend preserves the five dimensions and shows risk facts instead of a no-flags placeholder',async()=>{
  const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('function jevPayload('),source.indexOf('function jevErrorMessage('));
  const context={JEV_TAXONOMY_VERSION:'jev-taxonomy-v5.0.1',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
  runInNewContext(snippet+';this.render=renderJevResult;',context);
  const container={};context.render(container,{primaryActivity:{label:'Credit Documentation',responsibility:{value:'coordinate_enable',label:'Coordination & Enablement',evidence:[{source:'jd',quote:'Coordinate credit documents.'}]}},businessLine:{label:'Corporate & Institutional Banking',clientSegment:{value:'corporate_multinational',label:'Corporate Clients',evidence:[{source:'assignment',quote:'Business: Corporate Banking'}]}},roleRisk:{flags:[],state:'none',employment:{value:'permanent',label:'Explicit Permanent Employment',evidence:[{source:'jd',quote:'This is a permanent position.'}]},constraints:[{label:'Shift / On-call Obligations',evidence:[{source:'jd',quote:'<b>Weekend on-call</b>'}]}],clarification:[],postingShape:{label:'Specific Vacancy'},mandateEvidence:'adequate'}});
  assert.equal((container.innerHTML.match(/<dt>/g)||[]).length,4);assert.equal((container.innerHTML.match(/<h4>Role Risk<\/h4>/g)||[]).length,1);
  for(const text of ['Explicit Permanent Employment','Shift / On-call Obligations','Coordination &amp; Enablement','Corporate Clients','Assignment:'])assert.ok(container.innerHTML.includes(text));
  assert.doesNotMatch(container.innerHTML,/No supported structural flags|<b>/);assert.match(container.innerHTML,/&lt;b>/);
  assert.match(source,/linkedin-jev-analysis-v5\.0\.1/);
});
