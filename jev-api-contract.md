# JEV Analysis API Contract

## Current implementation

The frontend calls the same-origin `POST /api/jev/analyze`. The Cloudflare Worker keeps the TypeSafe API key server-side and proxies the official TypeSafe systemone endpoint. The endpoint is intentionally discoverable as part of a public web application, but it is not an unauthenticated provider endpoint: direct requests without the page's same-origin `Origin` are rejected, and the provider key is never exposed.

- URL: `https://api.typesafe.ai/v1/systemone`
- Model: `jev-latest`
- Authentication: `Authorization: Bearer <TYPESAFE_API_KEY>`
- Request: `{ "state": ..., "model": "jev-latest", "questions": {...} }`
- Upstream response: `{ "model": "jev-latest", "answers": {...} }`

Reference: [TypeSafe API documentation](https://docs.typesafe.ai/api).

## Endpoint

```text
POST /api/jev/analyze
Content-Type: application/json
Accept: application/json
```

The Worker validates request size, same-origin access and rate limits. It returns `503 provider_not_configured` when the server secret is missing; the browser never receives the secret.

## Request

```json
{
  "jobId": "ln:4470905602",
  "title": "Investment Analyst",
  "company": "Schroders",
  "location": "CN",
  "description": "Plain-text job description"
}
```

The description must contain at least 40 characters and is capped at 30,000 characters.

## JEV v2.2 response

The production taxonomy is defined in [`jev-taxonomy-v2.2.md`](./jev-taxonomy-v2.2.md) and is identified at runtime as `jev-taxonomy-v2.2`.

```json
{
  "schemaVersion": 2,
  "analysis": {
    "schemaVersion": 2,
    "taxonomyVersion": "jev-taxonomy-v2.2",
    "roleArchetype": "platform_cloud_reliability_engineering",
    "workProfile": {
      "primaryActivity": "technology_build",
      "secondaryActivities": ["data_analytics", "operations_processing"]
    },
    "businessContext": {
      "businessDomain": "wealth_private_banking",
      "businessProducts": ["payments"],
      "technologyPlatforms": ["apis_and_microservices"],
      "productOrPlatformContext": ["payments", "apis_and_microservices"]
    },
    "mandate": {
      "titleLevelSignal": "director_or_head",
      "roleLevel": "senior_individual_contributor",
      "seniorityAlignment": "title_higher_than_scope",
      "mandateScope": "workstream_or_project",
      "decisionAuthority": "ownership"
    },
    "leadershipLevel": "team_lead",
    "roleRisk": {
      "riskFlags": [
        {
          "code": "seniority_ambiguity",
          "severity": "medium",
          "reason": "The title and responsibility signals imply different seniority levels."
        }
      ]
    }
  }
}
```

The role-analysis dimensions are deliberately limited to:

```text
Role Archetype
Work Profile
Business Context
Mandate & Authority
Leadership Responsibility
Role Risk
```

`directReports`, `location_ambiguity`, `jd_too_short`, and `placeholder_or_test_role` are not part of the user-facing JEV result. Requirements, evidence quality, compensation and candidate fit are also outside the core JEV role taxonomy. Empty product/platform arrays mean `Not materially specified`; `unknown` is reserved for insufficient or contradictory evidence. The current TypeSafe question interface supplies controlled risk codes and severity; explanatory risk reasons remain a future enrichment because the current typed question contract does not return free-text rationale.

## UI behavior

- A job card displays `Analytics` only when its JD is expanded.
- `Analytics` is placed on the same summary row, immediately to the right of the expand arrow.
- Clicking `Analytics` runs or retrieves the analysis.
- The analysis result is inserted above the JD body, not below it.
- `JEV Analysis`, `View Cached Analysis`, `Local cache`, timestamps and other explanatory cache labels are not displayed.
- The Analytics marker is hidden whenever the JD is collapsed.

## Cache

The browser uses localStorage key:

```text
linkedin-jev-analysis-v2.2
```

The cache is keyed by job ID and stores the JD SHA-256 fingerprint, timestamp, taxonomy version and v2.2 result. A changed JD fingerprint or taxonomy version triggers a new analysis.

## Worker secret

Configure the Cloudflare Worker `linkedin` with:

```text
TYPESAFE_API_KEY = <secret>
```

Optional variables:

```text
JEV_MODEL = jev-latest
JEV_API_URL = https://api.typesafe.ai/v1/systemone
```

The secret must never be committed to Git, bundled into static assets, written to localStorage or returned in an API response.
