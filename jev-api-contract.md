# JEV Analysis API Contract — v4.4.4

## Runtime and compatibility

The browser calls the same-origin Cloudflare Worker `POST /api/jev/analyze`. The provider key remains server-side in the existing `TYPESAFE_API_KEY` / `JEV_API_KEY` binding. The existing Worker, ASSETS binding, endpoint, request limits, timeouts and deployment workflow remain in use.

The response retains `schemaVersion: 6` and the five visible dimensions. `taxonomyVersion` is `jev-taxonomy-v4.4.4`. Each dimension preserves `code`, `value`, `label`, `confidence`, `state`, and `candidates`; `evidence` is an additive array of selected source passages. Input schema `jev-input-v4` and job data are unchanged.

## Input

```json
{
  "jobId": "li-example",
  "title": "Senior Data Engineer",
  "company": "Example Bank",
  "location": "HK",
  "description": "Block-aware description text",
  "jevInput": {
    "schema": "jev-input-v4",
    "language": "en",
    "evidence_level": "adequate",
    "evidence_flags": [],
    "employer_metadata": "Business: Corporate Banking",
    "jd_text": "Optional preprocessed JD text"
  }
}
```

The frontend sends its preprocessed JD in `description`, with preprocessing metadata in `jevInput`; `jd_text` is optional and falls back to `description`. Raw fallback HTML is converted to blocks. The Worker checks same-origin Origin, enforces a 96 KB body limit / 30,000-character description limit and a 12 requests/minute per-client limit. It assesses duty evidence when valid preprocessing evidence metadata is absent; qualification-only text does not count as job duties.

## Provider request

One call to TypeSafe `https://api.typesafe.ai/v1/systemone`, model `jev-latest` (or configured model), using only supported Choice and Noul primitives. Shared state is `{title, company, location, employer_metadata, jd_blocks}`. Source passages occur once in state, not repeated in every question. At most 120 block IDs are offered; overflow is retained in the final block rather than dropping tail employment terms.

Twenty-two independent questions:

- Five classification choices: posting, archetype, activity, business line, leadership.
- Two explicit-context nouls: a directly established business line and multiple materially served lines.
- Three explicit-authority nouls: people management, team/workstream leadership, manager-of-managers.
- Four structural-risk nouls: title mismatch, unclear overloaded scope, employment terms, sparse/template evidence.
- Eight evidence-selection choices: four visible classification dimensions and four risks (posting evidence covers the pooled-vacancy risk). Whole-description evidence quality is assessed separately.

Evidence choices select a block ID or `none`; employment/posting evidence may also select explicit title terms. No question reads another answer in the same call. The server resolves the selected ID to the actual input text, so the provider cannot invent a quotation. Passage selection itself remains a model judgment and can be wrong. No free-text generation primitive is assumed.

## Classification and uncertainty

`jev-taxonomy.mjs` is the single source for criteria and display labels. `node gen-taxonomy-doc.mjs` generates `jev-taxonomy-v4.4.4.md`; a regression test checks exact agreement. Historical taxonomy documents remain historical.

- **Role Archetype:** occupational mandate, with inclusion/exclusion boundaries. v4.4 separates markets sales/trading; compliance/legal; data engineering/BI; ML/financial quant; actuarial/underwriting/claims. It also adds independent model validation, nontechnical change delivery and client onboarding.
- **Primary Activity:** the recurring output, independently judged. Never filled from archetype defaults. An otherwise valid answer without confidence is preserved as uncertain instead of overwritten. Confidence below 0.35 abstains.
- **Business Line:** directly served product/service line first, then client segment. Employer brand is not evidence. Internal department without coverage is `not_stated`; an explicit group mandate is `enterprise_wide`. `other_business_line` handles explicit businesses outside banking.
- **Leadership:** current authority rather than title grade. Team/people/hierarchical management requires a selected source passage and supporting nouls >= 0.8. Manager-of-managers also needs people-management support. Missing/weak evidence does not turn into IC. A substituted classification clears the rejected confidence and remains visibly conflicting.
- **Role Risk:** source-supported clarification points, not a rating of the employer or a conclusion that workload is unrealistic. Employment/pooled risks require both model support and an actual selected source. Contract/vendor keywords and alternative locations do not trigger flags automatically. Missing/unsupported risk assessment is `not_stated`, distinct from `none`.

Business Line requires explicit-context support >= 0.8 and a non-conflicting classification >= 0.5; multi-line additionally requires explicit multiple-line support >= 0.8. KYC, credit and portfolio data do not establish multiple business lines.

Evidence selections require a valid source ID and finite positive confidence. Selection confidence measures which passage to cite, not whether the independent classification is certain; several equally valid passages can split that probability. Missing citations do not change independently measured occupation/activity confidence. Leadership and risk gates still require source evidence. Invalid/nonfinite/out-of-range confidence and probability values are ignored, and candidates are restricted to valid categories and displayed using readable labels. Close alternatives are marked conflicting. These thresholds are engineering gates, not a measured accuracy claim.

Non-job content clears all dimensions, evidence and candidates. Insufficient duties suppress occupation, activity and leadership guesses, while explicitly evidenced business context can remain. `not_applicable` is reserved for non-job content; real underspecified jobs use `not_stated`, `not_determinable`, or `insufficient_evidence`.

The five ambiguous role codes from v4.3 are retired: `CS6_markets_sales_trading`, `RC3_compliance_legal`, `TE5_data_engineering_analytics`, `TE6_ai_ml_quant`, `CF6_actuarial_insurance_technical`. They are not silently mapped into narrower professions. Other valid codes remain accepted.

## Frontend and cache

The card keeps its five dimensions, with compact labels and escaped source excerpts (full excerpt in title). Risk rows contain a specific clarification question/action plus their supporting source. Empty risk results distinguish unassessed from no supported flags. Rendering never inserts JD evidence as HTML.

Successful entries use `linkedin-jev-analysis-v4.4.4`, keyed by job ID and SHA-256 JD fingerprint. v4.3 results cannot be reused as v4.4; responses from a different taxonomy during deployment are not written into the v4.4 cache. There is no automatic mass reanalysis; a user's next analysis click runs the current taxonomy.

## Errors and validation

Existing error semantics remain: 400 invalid request, 422 short description, 403 Origin mismatch, 405 wrong method, 413 oversized request, 429 rate limit, 503 missing/invalid provider configuration, 502 provider error, 504 timeout. Empty/error-only HTTP-200 provider envelopes do not become cacheable analyses. Supported direct/chat/tool-call and partial responses remain accepted with conservative unknown states. Errors show an explicit retry and are never cached.

Runtime regression tests cover misleading title grades, hierarchy gates, missing answers/confidence, invalid scores, contract/vendor false positives, pooled versus same-role openings, source bounds, bilingual duties, source HTML escaping, non-job neutralisation, document drift and API failures. These deterministic tests validate application safeguards, not model accuracy; real-JD spot checks are reported separately.

No changes to JobSpy, lifecycle statuses, blacklist logic, company statistics, visitor counts or cursor styling are required. Rollback is a git revert of the coordinated Worker/taxonomy/frontend change.
