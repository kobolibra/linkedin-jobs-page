import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateRequest, buildProviderRequest, parseProviderResponse } from './worker.js';

const input = (extra = {}) => ({ jobId: 'li-1', title: 'Senior Data Engineer', company: 'ACME', location: 'HK', description: 'A'.repeat(100), ...extra });

test('validates and bounds the browser payload including v3 hints', () => {
  const value = validateRequest(input({ jevInput: { role_summary: 'Role', responsibilities: 'Owns recurring data platform delivery', requirements: 'Experience', servedBusinessLineHint: 'wealth_premier', operatingContextHint: 'technology_development_centre' } }));
  assert.equal(value.jevInput.servedBusinessLineHint, 'wealth_premier');
  assert.equal(value.jevInput.operatingContextHint, 'technology_development_centre');
  assert.throws(() => validateRequest({ description: 'too short' }), /description_required/);
  assert.throws(() => validateRequest(null), /invalid_json/);
});

test('builds compact v3 questions without duplicating JD into every question', () => {
  const { url, model, payload } = buildProviderRequest(input({ jevInput: { role_summary: 'Role summary', responsibilities: 'Owns recurring analysis responsibilities', requirements: 'Relevant experience' } }), {});
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(model, 'jev-1.13.0');
  assert.equal(payload.model, 'jev-1.13.0');
  assert.equal(payload.state.company, 'ACME');
  assert.ok(payload.questions.roleArchetype.criteria.TE1);
  assert.equal(payload.questions.primaryActivity, undefined);
  assert.equal(payload.questions.businessProduct1, undefined);
  assert.equal(payload.questions.technologyPlatform1, undefined);
  assert.equal(payload.questions.product_deposits_accounts_payments.type, 'noul');
  assert.equal(payload.questions.platform_data_platforms.type, 'noul');
  assert.equal(typeof payload.questions.roleArchetype.instructions, 'string');
  assert.equal(payload.questions.roleArchetype.instructions.includes('Role summary'), false);
  assert.equal(JSON.stringify(payload.questions).includes('Owns recurring analysis responsibilities'), false);
  assert.ok(payload.questions.workMix_technicalDelivery);
  assert.ok(payload.questions.leadershipLevel.criteria.individual_contributor);
});

test('derives six-field v3 output from structured answers', () => {
  const result = parseProviderResponse({ answers: {
    postingType: { type: 'choice', choice: 'specific_role' },
    roleArchetype: { type: 'choice', choice: 'TE5', confidence: 0.72 },
    workMix_technicalDelivery: { type: 'noul', value: 0.94 },
    workMix_analysis: { type: 'noul', value: 0.80 },
    product_funds_mutual_private: { type: 'noul', value: 0.80 },
    platform_data_platforms: { type: 'noul', value: 0.91 },
    servedBusinessLine: { type: 'choice', choice: 'global_markets', confidence: 0.82 },
    operatingContext: { type: 'choice', choice: 'technology_development_centre', confidence: 0.78 },
    roleLevel: { type: 'choice', choice: 'senior_individual_contributor', confidence: 0.83 },
    mandateScope: { type: 'choice', choice: 'workstream_or_project' },
    decisionAuthority: { type: 'choice', choice: 'recommendation' },
    leadershipLevel: { type: 'choice', choice: 'individual_contributor', confidence: 0.75 },
    hasExplicitPeopleManagement: { type: 'noul', value: 0.05 },
    hasExplicitTeamLeadership: { type: 'noul', value: 0.05 },
  } }, input({ title: 'Senior Data Engineer' }));
  assert.equal(result.taxonomyVersion, 'jev-taxonomy-v3.0');
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.roleArchetype, 'TE5');
  assert.equal(result.roleFamily, 'TE');
  assert.equal(result.workProfile.primaryActivity, 'technology_build');
  assert.deepEqual(result.workProfile.secondaryActivities, ['research_analysis']);
  assert.deepEqual(result.businessContext.businessProducts, ['funds_mutual_private']);
  assert.deepEqual(result.businessContext.technologyPlatforms, ['data_platforms']);
  assert.equal(result.businessContext.servedBusinessLine, 'global_markets');
  assert.equal(result.businessContext.operatingContext, 'technology_development_centre');
  assert.equal(result.leadershipLevel, 'individual_contributor');
});

test('defaults readable no-management postings to individual contributor', () => {
  const result = parseProviderResponse({ answers: { roleArchetype: { type: 'choice', choice: 'CS1' }, leadershipLevel: { type: 'choice', choice: 'not_stated' } } }, { jevInput: { evidence_level: 'adequate', evidence_flags: [] } });
  assert.equal(result.leadershipLevel, 'individual_contributor');
});

test('gates people manager output on explicit management evidence', () => {
  const result = parseProviderResponse({ answers: {
    leadershipLevel: { type: 'choice', choice: 'people_manager' },
    hasExplicitPeopleManagement: { type: 'noul', value: 0.1 },
    hasExplicitTeamLeadership: { type: 'noul', value: 0.8 },
  } }, { jevInput: { evidence_level: 'adequate', evidence_flags: [] } });
  assert.equal(result.leadershipLevel, 'team_lead');
});

test('maps legacy archetypes while emitting v3 codes', () => {
  const result = parseProviderResponse({ answers: { roleArchetype: { type: 'choice', choice: 'finance_accounting_treasury_control' } } }, input({ title: '' }));
  assert.equal(result.roleArchetype, 'CF1');
  assert.equal(result.roleFamily, 'CF');
});

test('does not duplicate insufficient evidence or trust unsupported placeholder risks', () => {
  const result = parseProviderResponse({ answers: { riskFlag1: { type: 'choice', choice: 'template_placeholder_text' }, riskSeverity1: { type: 'choice', choice: 'high' } } }, { jevInput: { evidence_flags: ['insufficient_role_evidence'] } });
  assert.deepEqual(result.roleRisk.riskFlags, []);
  const supported = parseProviderResponse({ answers: { riskFlag1: { type: 'choice', choice: 'template_placeholder_text' }, riskSeverity1: { type: 'choice', choice: 'high' } } }, { jevInput: { evidence_flags: ['template_placeholder_text'] } });
  assert.equal(supported.roleRisk.riskFlags[0].severity, 'medium');
});

test('keeps long JD in state once and keeps request compact', () => {
  const long = 'responsibility '.repeat(1800);
  const { payload } = buildProviderRequest(input({ description: long, jevInput: { role_summary: long.slice(0, 3000), responsibilities: long.slice(0, 10000), requirements: 'requirements' } }), {});
  assert.ok(JSON.stringify(payload.questions).length < 60000);
  assert.equal(JSON.stringify(payload.questions).includes(long.slice(0, 500)), false);
  assert.ok(JSON.stringify(payload.state).includes(long.slice(0, 500)));
});

test('returns 503 instead of leaking a provider key when not configured', async () => {
  const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://linkedin.example' }, body: JSON.stringify({ description: 'A'.repeat(100) }) });
  const response = await worker.fetch(request, { ASSETS: { fetch: async () => new Response('asset') } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'provider_not_configured' });
});

test('rejects direct API calls without a same-origin browser Origin', async () => {
  const response = await worker.fetch(new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'A'.repeat(100) }) }), { TYPESAFE_API_KEY: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } });
  assert.equal(response.status, 403);
});

test('proxies answers without exposing the provider key', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, init) => { upstreamRequest = { url, init }; return new Response(JSON.stringify({ answers: { roleArchetype: { type: 'choice', choice: 'CF1' }, workMix_analysis: { type: 'noul', value: 0.9 } } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const response = await worker.fetch(new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://linkedin.example' }, body: JSON.stringify({ jobId: 'li-1', description: 'A'.repeat(100) }) }), { TYPESAFE_API_KEY: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(upstreamRequest.init.headers.authorization, 'Bearer test-only-secret');
    assert.equal(body.analysis.roleArchetype, 'CF1');
    assert.equal(JSON.stringify(body).includes('test-only-secret'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('does not send API requests for static assets', async () => {
  let called = false;
  const response = await worker.fetch(new Request('https://linkedin.example/app.js'), { ASSETS: { fetch: async () => { called = true; return new Response('ok'); } } });
  assert.equal(response.status, 200); assert.equal(called, true);
});

test('serves the deployed homepage asset with an uncacheable HTML shell', async () => {
  const response = await worker.fetch(new Request('https://linkedin.example/'), { ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'cache-control': 'public, max-age=0' } }) } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
});
