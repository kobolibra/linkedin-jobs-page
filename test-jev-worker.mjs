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
  const { url, model, payload } = buildProviderRequest({ jobId: 'li-1', title: 'Analyst', company: 'ACME', location: 'HK', description: 'A'.repeat(100) }, {});
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(model, 'jev-latest');
  assert.equal(payload.model, 'jev-latest');
  assert.equal(payload.state.company, 'ACME');
  assert.equal(payload.questions.function.type, 'choice');
  assert.ok(payload.questions.function.criteria.client_commercial);
});

test('normalizes official TypeSafe answers to the frontend contract', () => {
  const result = parseProviderResponse({ model: 'jev-latest', answers: {
    function: { type: 'choice', choice: 'technology_engineering', confidence: 0.9 },
    businessDomain: { type: 'choice', choice: 'banking', confidence: 0.8 },
    seniorityBand: { type: 'choice', choice: 'manager_lead_principal', confidence: 0.8 },
    riskFlag: { type: 'choice', choice: 'management_ambiguity', confidence: 0.7 },
  } });
  assert.deepEqual(result.businessDomains, ['banking']);
  assert.equal(result.function, 'technology_engineering');
  assert.equal(result.riskFlags[0].code, 'management_ambiguity');
  assert.equal(result.directReportsRequired, 'unknown');
});

test('returns 503 instead of leaking a provider key when not configured', async () => {
  const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'origin': 'https://linkedin.example' }, body: JSON.stringify({ description: 'A'.repeat(100) }) });
  const assets = { fetch: async () => new Response('asset') };
  const response = await worker.fetch(request, { ASSETS: assets });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'provider_not_configured' });
});

test('proxies official TypeSafe answers without exposing the key to the response', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, init) => {
    upstreamRequest = { url, init };
    return new Response(JSON.stringify({ model: 'jev-latest', answers: {
      function: { type: 'choice', choice: 'finance_accounting_treasury', confidence: 0.91 },
      businessDomain: { type: 'choice', choice: 'banking', confidence: 0.88 },
      seniorityBand: { type: 'choice', choice: 'analyst_associate_consultant', confidence: 0.85 },
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const request = new Request('https://linkedin.example/api/jev/analyze', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://linkedin.example' }, body: JSON.stringify({ jobId: 'li-1', description: 'A'.repeat(100) }) });
    const response = await worker.fetch(request, { TYPESAFE_API_KEY: 'test-only-secret', ASSETS: { fetch: async () => new Response('asset') } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(upstreamRequest.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(upstreamRequest.init.headers.authorization, 'Bearer test-only-secret');
    assert.equal(body.analysis.function, 'finance_accounting_treasury');
    assert.equal(body.analysis.businessDomains[0], 'banking');
    assert.equal(JSON.stringify(body).includes('test-only-secret'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('does not send API requests for static assets', async () => {
  let called = false;
  const response = await worker.fetch(new Request('https://linkedin.example/'), { ASSETS: { fetch: async () => { called = true; return new Response('ok'); } } });
  assert.equal(response.status, 200);
  assert.equal(called, true);
});
