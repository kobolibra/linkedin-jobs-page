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

test('builds Requesty questions payload without credentials', () => {
  const { url, model, payload } = buildProviderRequest({ jobId: 'li-1', title: 'Analyst', company: 'ACME', location: 'HK', description: 'A'.repeat(100) }, {});
  assert.equal(url, 'https://router.requesty.ai/v1/chat/completions');
  assert.equal(model, 'typesafe/jev-latest');
  assert.equal(payload.response_format.type, 'questions');
  assert.ok(payload.response_format.questions.function.criteria.client_commercial);
  assert.equal(payload.messages[0].role, 'user');
});

test('normalizes a Requesty assistant JSON response to the frontend contract', () => {
  const result = parseProviderResponse({ choices: [{ message: { content: JSON.stringify({ function: 'technology_engineering', businessDomain: 'banking', seniorityBand: 'manager_lead_principal', riskFlag: 'management_ambiguity' }) } }] });
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

test('does not send API requests for static assets', async () => {
  let called = false;
  const response = await worker.fetch(new Request('https://linkedin.example/'), { ASSETS: { fetch: async () => { called = true; return new Response('ok'); } } });
  assert.equal(response.status, 200);
  assert.equal(called, true);
});
