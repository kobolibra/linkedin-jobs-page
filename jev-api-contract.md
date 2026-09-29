# JEV Analysis API Contract — v3.0

## Purpose

JEV classifies the role represented by a job description. It is evidence-led: responsibilities and outputs dominate; title is a weak prior; requirements and employer boilerplate are not role evidence.

- Endpoint: same-origin `POST /api/jev/analyze`
- Provider: `https://api.typesafe.ai/v1/systemone`
- Model: `jev-1.13.0`
- Taxonomy: `jev-taxonomy-v3.0`
- Response schema: `4`
- Secret: Worker-only `TYPESAFE_API_KEY` / compatible configured secret

## Request

```json
{
  "jobId": "ln:4470905602",
  "title": "Senior Data Engineer",
  "company": "Example Bank",
  "location": "HK",
  "description": "Plain-text job description",
  "jevInput": {
    "role_summary": "Structured role summary",
    "responsibilities": "Responsibilities only",
    "requirements": "Requirements only",
    "employer_metadata": "Business: CTO Data Technology",
    "language": "en_or_mixed",
    "evidence_level": "adequate",
    "evidence_flags": [],
    "title_signals": {"title_level_market": "senior_individual_contributor", "convention_tags": []},
    "servedBusinessLineHint": "group_functions_enterprise",
    "operatingContextHint": "technology_development_centre"
  }
}
```

Description must be at least 40 characters and is capped at 30,000 characters. The Worker also validates total request size, same-origin `Origin`, and rate limits.

## Response shape

```json
{
  "schemaVersion": 4,
  "analysis": {
    "schemaVersion": 4,
    "taxonomyVersion": "jev-taxonomy-v3.0",
    "postingType": "specific_role",
    "roleArchetype": "TE5",
    "roleFamily": "TE",
    "roleFamilyLabel": "Technology & Engineering",
    "roleArchetypeLabel": "Data Engineering & Analytics",
    "workProfile": {
      "primaryActivity": "technology_build",
      "secondaryActivities": ["research_analysis"],
      "workMix": {"technicalDelivery": "yes", "analysis": "yes"}
    },
    "businessContext": {
      "businessDomain": "other_unknown",
      "servedBusinessLine": "group_functions_enterprise",
      "operatingContext": "technology_development_centre",
      "businessProducts": [],
      "technologyPlatforms": ["data_platforms"],
      "productOrPlatformContext": ["data_platforms"]
    },
    "mandate": {
      "roleLevel": "senior_individual_contributor",
      "titleLevelSignal": "senior_individual_contributor",
      "titleConventionTags": [],
      "seniorityAlignment": "aligned",
      "mandateScope": "workstream_or_project",
      "decisionAuthority": "recommendation"
    },
    "leadershipLevel": "individual_contributor",
    "roleRisk": {"riskFlags": []},
    "confidence": {},
    "states": {},
    "evidence": {"level": "adequate", "flags": []}
  }
}
```

## Six card fields

The frontend displays only:

1. Role Archetype — family plus archetype label
2. Primary Activity — derived from workMix noul scores
3. Business Line Served
4. Operating Context
5. Business Products, or Business Products / Platforms when products are empty and platforms are present
6. Leadership Level

Internal fields remain available for audit and downstream analysis but are not rendered as card dimensions: title level, role level, title convention, seniority alignment, mandate scope, decision authority, platform list, confidence/state and evidence.

## v3 question design

The provider receives the full JD in `state` once. Question instructions are strings that refer to state fields and do not embed the JD. This prevents request size multiplying with question count.

The provider is asked for:

- posting type and one of 32 controlled role archetypes;
- served business line and operating context;
- role level, mandate scope and decision authority;
- leadership level plus explicit people-management/team-lead noul gates;
- ten workMix noul signals used to derive Primary Activity;
- one noul per 14 business-product families and one per 8 technology-platform families;
- up to three material structural risks.

## State and confidence

`ok`, `low_confidence`, `not_stated`, `not_applicable`, and `conflicting` are controlled states. Percentages are shown only for `ok`; conflicting/low-confidence dimensions show candidates instead. `thin_role_evidence` and `insufficient_role_evidence` are internal evidence flags, not user-facing Role Risk.

## Cache

```text
linkedin-jev-analysis-v3.0
```

Each record is keyed by job ID and stores JD SHA-256 fingerprint, analysis timestamp, taxonomy version, provider model and normalized v3 result. A changed JD, model or taxonomy invalidates the record.

## Security

The Worker rejects direct requests without a same-origin Origin, applies a per-IP rate limit, and never returns or stores the provider key. The provider key must not be committed, bundled into static assets or written to browser storage.
