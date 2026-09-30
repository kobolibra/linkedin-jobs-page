# JEV Analysis API Contract — v4.1

## Runtime

The browser calls the same-origin Cloudflare Worker endpoint `POST /api/jev/analyze`. The provider key remains server-side in the existing Cloudflare Worker secret binding `TYPESAFE_API_KEY`; it is never stored in GitHub, browser code, or job payloads.

## Input

```json
{
  "jobId": "li-example",
  "title": "Senior Data Engineer",
  "company": "Example Bank",
  "location": "HK",
  "description": "Fallback full JD text",
  "jevInput": {
    "schema": "jev-input-v4",
    "jd_text": "De-boilerplated, block-aware job description",
    "language": "en",
    "evidence_level": "rich",
    "evidence_flags": [],
    "employer_metadata": "Business: Corporate and Institutional Banking"
  }
}
```

`description` is the safe fallback. The browser uses the preprocessed `jevInput.jd_text` when available, otherwise it reconstructs block-aware text from the JD HTML. The Worker validates the payload, enforces a 96 KB body limit, truncates description input to 30,000 characters, checks same-origin `Origin`, and applies a 12 requests/minute per-client rate limit.

## Provider request

The Worker sends one compact state object `{title, company, location, employer_metadata, jd_text}` to TypeSafe `https://api.typesafe.ai/v1/systemone` using model `jev-1.13.0`. It asks exactly 18 independent questions: five choices for posting/archetype/activity/business line/leadership, two nouls for people/team evidence, four nouls for structural risk signals, and seven family specialisation choices. No question cites another answer and no provider-side arithmetic or date comparison is requested.

## Output

The response has `schemaVersion: 6`, `taxonomyVersion: "jev-taxonomy-v4.1"`, and an `analysis` object containing exactly five visible dimensions: **Role Archetype**, **Primary Activity**, **Business Line**, **Leadership Level**, and **Role Risk**. Internal `postingType`, title signals, evidence, nouls and usage are metadata rather than additional card dimensions. Every dimension carries bounded confidence/state/candidate metadata; leadership also carries explicit people/team evidence.

Non-job postings neutralise all dimensions. Insufficient evidence never becomes a confident profession guess. Primary Activity is a model judgement; archetype defaults are only a low-confidence fallback. Leadership is gated by explicit people/team evidence, not by Head/Director titles.

## Error semantics

- `400` invalid JSON/request; `422` missing or too-short description; `403` non-site origin; `405` wrong method; `413` request too large; `429` rate limit; `503` missing/invalid Worker secret; `502` provider error; `504` provider timeout.
- Errors are rendered in the panel with a visible retry button and are never written to localStorage.
- Successful cache entries use `linkedin-jev-analysis-v4.1`, are keyed by job ID plus SHA-256 JD fingerprint, and are written only after successful rendering.

## Data pipeline

`scripts/jobspy/jev_preprocess.py` and the Worker fallback use block-aware HTML parsing, static boilerplate removal, employer-frequency template removal at the fixed `15% / 12 jobs / 30 characters` threshold, duplicate removal, metadata extraction, and evidence assessment. `build_frontend_payload.py` writes `jevInput` for every JD and `data/jev-boilerplate.json` for auditability without changing the existing display JD fields.

## Deployment invariant

The existing `deploy.yml` publishes the same `linkedin` Worker with the existing `ASSETS` binding and Cloudflare credentials. No second Cloudflare deployment workflow is created. Rollback is a single git revert because the Worker, frontend, tests, and data contract are versioned together.
