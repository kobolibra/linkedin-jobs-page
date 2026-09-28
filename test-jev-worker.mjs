import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateRequest, buildProviderRequest, parseProviderResponse } from './worker.js';

test('validates and bounds the browser payload', () => {
  const input = validateRequest({ jobId: 'li-1', title: 'Analyst', company: 'ACME', location: 'HK', description: 'A'.repeat(100) });
  assert.equal(input.jobId, 'li-1');
  assert.equal(input.description.length, 100);
  assert.throws(() => validateRequest({ description: 'too short' }), /description_required/);
  assert.throws(() => validateRequest(null), /invalid_json/);
});

test('builds the official TypeSafe systemone payload without credentials', () => {
  const { url, model, payload } = buildProviderRequest({ jobId: 'li-1', title: 'Analyst', company: 'ACME', location: 'HK', description: 'A'.repeat(100), jevInput: { role_summary: 'Role summary', responsibilities: 'Owns recurring analysis responsibilities', requirements: 'Relevant experience' } }, {});
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(model, 'jev-1.13.0');
  assert.equal(payload.model, 'jev-1.13.0');
  assert.equal(payload.state.company, 'ACME');
  assert.equal(payload.questions.roleArchetype.type, 'choice');
  assert.ok(payload.questions.roleArchetype.criteria.client_relationship_coverage);
  assert.ok(payload.questions.primaryActivity.criteria.technology_build);
  assert.ok(payload.questions.secondaryActivity1.criteria.data_analytics);
  assert.ok(payload.questions.businessProduct1.criteria.payments);
  assert.ok(payload.questions.technologyPlatform1.criteria.cloud_platforms);
  assert.ok(payload.questions.postingType.criteria.specific_role);
  assert.ok(payload.questions.servedBusinessLine.criteria.global_markets);
  assert.ok(payload.questions.operatingContext.criteria.shared_service_centre);
  assert.ok(payload.questions.workMix_technicalDelivery.type === 'noul');
  assert.ok(payload.questions.roleLevel.instructions.title);
  assert.ok(payload.questions.roleLevel.instructions.role_summary);
  assert.ok(payload.questions.roleLevel.instructions.responsibilities);
  assert.equal(payload.questions.titleLevelSignal, undefined);
  assert.equal(payload.questions.seniorityAlignment, undefined);
  assert.ok(payload.questions.riskFlag3.criteria.seniority_ambiguity);
  assert.ok(payload.questions.riskSeverity1.criteria.high);
  assert.equal(payload.questions.directReportsRequired, undefined);
});

test('normalizes official TypeSafe answers to the frontend contract', () => {
  const result = parseProviderResponse({ model: 'jev-latest', answers: {
    roleArchetype: { type: 'choice', choice: 'platform_cloud_reliability_engineering', confidence: 0.9 },
    primaryActivity: { type: 'choice', choice: 'technology_build', confidence: 0.9 },
    businessDomain: { type: 'choice', choice: 'wealth_private_banking', confidence: 0.8 },
    seniorityBand: { type: 'choice', choice: 'senior_individual_contributor', confidence: 0.8 },
    mandateScope: { type: 'choice', choice: 'workstream_or_project', confidence: 0.8 },
    decisionAuthority: { type: 'choice', choice: 'ownership', confidence: 0.8 },
    leadershipLevel: { type: 'choice', choice: 'team_lead', confidence: 0.8 },
    riskFlag: { type: 'choice', choice: 'leadership_ambiguity', confidence: 0.7 },
  } });
  assert.deepEqual(result.businessDomains, ['wealth_private_banking']);
  assert.equal(result.roleArchetype, 'platform_cloud_reliability_engineering');
  assert.equal(result.workProfile.primaryActivity, 'technology_build');
  assert.equal(result.mandate.decisionAuthority, 'ownership');
  assert.equal(result.leadershipLevel, 'team_lead');
  assert.equal(result.roleRisk.riskFlags[0].code, 'leadership_ambiguity');
  assert.equal(result.directReportsRequired, undefined);
});

test('normalizes the complete controlled v2.3 dimensions', () => {
  const result = parseProviderResponse({ answers: {
    roleArchetype: { type: 'choice', choice: 'data_ai_quantitative_analytics' },
    primaryActivity: { type: 'choice', choice: 'data_analytics' },
    secondaryActivity1: { type: 'choice', choice: 'technology_build' },
    secondaryActivity2: { type: 'choice', choice: 'research_analysis' },
    businessDomain: { type: 'choice', choice: 'capital_markets' },
    businessProduct1: { type: 'choice', choice: 'fixed_income' },
    businessProduct2: { type: 'choice', choice: 'none' },
    technologyPlatform1: { type: 'choice', choice: 'data_platforms' },
    technologyPlatform2: { type: 'choice', choice: 'trading_systems' },
    roleLevel: { type: 'choice', choice: 'senior_individual_contributor' },
    servedBusinessLine: { type: 'choice', choice: 'global_markets' },
    operatingContext: { type: 'choice', choice: 'onshore_bank_business_unit' },
    mandateScope: { type: 'choice', choice: 'workstream_or_project' },
    decisionAuthority: { type: 'choice', choice: 'recommendation' },
    leadershipLevel: { type: 'choice', choice: 'informal_influencer' },
    riskFlag1: { type: 'choice', choice: 'seniority_ambiguity' },
    riskFlag2: { type: 'choice', choice: 'title_scope_mismatch' },
    riskFlag3: { type: 'choice', choice: 'none' },
    riskSeverity1: { type: 'choice', choice: 'high' },
    riskSeverity2: { type: 'choice', choice: 'low' },
  } }, { title: 'Premier Relationship Director', company: 'HSBC' });
  assert.equal(result.taxonomyVersion, 'jev-taxonomy-v2.3');
  assert.deepEqual(result.workProfile.secondaryActivities, ['technology_build', 'research_analysis']);
  assert.deepEqual(result.businessContext.businessProducts, ['fixed_income']);
  assert.deepEqual(result.businessContext.technologyPlatforms, ['data_platforms', 'trading_systems']);
  assert.deepEqual(result.businessContext.productOrPlatformContext, ['fixed_income', 'data_platforms', 'trading_systems']);
  assert.equal(result.mandate.titleLevelSignal, 'professional');
  assert.equal(result.mandate.roleLevel, 'senior_individual_contributor');
  assert.equal(result.mandate.seniorityAlignment, 'employer_title_convention');
  assert.equal(result.businessContext.servedBusinessLine, 'global_markets');
  assert.equal(result.businessContext.operatingContext, 'onshore_bank_business_unit');
  assert.equal(result.schemaVersion, 3);
  assert.deepEqual(result.roleRisk.riskFlags.map(item => item.severity), ['high', 'low']);
});

test('does not duplicate insufficient evidence or trust unsupported placeholder risks', () => {
  const result = parseProviderResponse({ answers: {
    riskFlag1: { type: 'choice', choice: 'template_placeholder_text' },
    riskSeverity1: { type: 'choice', choice: 'high' },
  } }, { jevInput: { evidence_flags: ['insufficient_role_evidence'] } });
  assert.deepEqual(result.evidence.flags, ['insufficient_role_evidence']);
  assert.deepEqual(result.roleRisk.riskFlags, []);

  const supported = parseProviderResponse({ answers: {
    riskFlag1: { type: 'choice', choice: 'template_placeholder_text' },
    riskSeverity1: { type: 'choice', choice: 'high' },
  } }, { jevInput: { evidence_flags: ['template_placeholder_text'] } });
  assert.equal(supported.roleRisk.riskFlags[0].severity, 'medium');
});

test('returns 503 instead of leaking a provider key when not configured', async () => {
  const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'origin': 'https://linkedin.example' }, body: JSON.stringify({ description: 'A'.repeat(100) }) });
  const assets = { fetch: async () => new Response('asset') };
  const response = await worker.fetch(request, { ASSETS: assets });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'provider_not_configured' });
});

test('rejects direct API calls without a same-origin browser Origin', async () => {
  const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'A'.repeat(100) }) });
  const response = await worker.fetch(request, { TYPESAFE_API_KEY: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'origin_not_allowed' });
});

test('proxies official TypeSafe answers without exposing the key to the response', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, init) => {
    upstreamRequest = { url, init };
    return new Response(JSON.stringify({ model: 'jev-latest', answers: {
      roleArchetype: { type: 'choice', choice: 'finance_accounting_treasury_control', confidence: 0.91 },
      primaryActivity: { type: 'choice', choice: 'finance_control', confidence: 0.91 },
      businessDomain: { type: 'choice', choice: 'commercial_corporate_banking', confidence: 0.88 },
      seniorityBand: { type: 'choice', choice: 'professional', confidence: 0.85 },
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://linkedin.example' }, body: JSON.stringify({ jobId: 'li-1', description: 'A'.repeat(100) }) });
    const response = await worker.fetch(request, { TYPESAFE_API_KEY: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(upstreamRequest.init.headers.authorization, 'Bearer test-only-secret');
    assert.equal(body.analysis.roleArchetype, 'finance_accounting_treasury_control');
    assert.equal(body.analysis.businessContext.businessDomain, 'commercial_corporate_banking');
    assert.equal(JSON.stringify(body).includes('test-only-secret'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('does not send API requests for static assets', async () => {
  let called = false;
  const response = await worker.fetch(new Request('https://linkedin.example/app.js'), { ASSETS: { fetch: async () => { called = true; return new Response('ok'); } } });
  assert.equal(response.status, 200);
  assert.equal(called, true);
});

test('serves the deployed homepage asset with an uncacheable HTML shell', async () => {
  let calls = 0;
  const response = await worker.fetch(new Request('https://linkedin.example/'), {
    ASSETS: { fetch: async () => { calls += 1; return new Response('<!doctype html>', { headers: { 'cache-control': 'public, max-age=0' } }); } },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), '<!doctype html>');
});
