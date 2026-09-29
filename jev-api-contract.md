# JEV Analysis API Contract — v3.1

## Runtime

The browser calls the same-origin Cloudflare Worker endpoint `POST /api/jev/analyze`. The provider key remains server-side in the existing Cloudflare secret binding `TYPESAFE_API_KEY`; no key is stored in GitHub, browser code, or job payloads.

## Input

```json
{
  "jobId": "li-example",
  "title": "Senior Data Engineer",
  "company": "Example Bank",
  "location": "HK",
  "description": "Fallback full JD text",
  "jevInput": {
    "role_summary": "Structured role summary",
    "responsibilities": "Structured recurring responsibilities",
    "requirements": "Structured requirements",
    "employer_metadata": "Business: Group Technology",
    "entity_signals": ["Business: Group Technology", "Entity mention: DBS Technology"],
    "evidence_level": "adequate",
    "evidence_flags": [],
    "title_signals": {}
  }
}
```

`description` is required as a safe fallback. When structured `jevInput` exists, the provider receives the structured sections once; legacy hint fields are dropped before the provider request.

## Output

The response has `schemaVersion: 5`, `taxonomyVersion: "jev-taxonomy-v3.1"`, and an `analysis` object containing the six card-level fields: Role Archetype, Primary Activity, Business Line Served, Operating Context, Business Products / Platforms, and Leadership Level, plus bounded structural risks, confidence/state metadata, and evidence flags.

The parser accepts real TypeSafe noul answers (`{type:"noul", noul:0.83}`) and tolerates legacy `.value` only for backward compatibility. Model business-line and operating-context answers are authoritative; entity signals are evidence and do not overwrite them. `postingType=not_a_job_posting` yields `not_applicable` for role archetype, business line, operating context and leadership.

## Deployment invariant

Deploy the Worker with the existing `linkedin` script and `ASSETS` binding. Do not create a second GitHub Actions Cloudflare deploy workflow. The existing Cloudflare secret binding `TYPESAFE_API_KEY` remains unchanged.
