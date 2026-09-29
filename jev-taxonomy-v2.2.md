# JEV v2.2 — Evidence-led Job Evaluation

> **历史基线，不是当前生产 taxonomy。** 当前生产实现为 [`jev-taxonomy-v3.1.md`](jev-taxonomy-v3.1.md)，版本 `jev-taxonomy-v3.1` / schema 5；v2.2 仅用于追溯设计演进。

## 1. Purpose

JEV classifies the **role represented by a job description**, not the candidate and not the employer alone. Every output must be:

- controlled by a finite enum;
- grounded in the title and the JD body;
- explicit about missing evidence;
- able to represent title/JD disagreement;
- orthogonal across profession, work, context, scope and leadership.

`Not materially specified` means the JD does not materially identify a dimension. `Unknown` means the evidence is present or relevant but insufficient or contradictory for a reliable controlled choice. They must not be displayed as the same state.

## 2. Evidence hierarchy

For every classification, use this order:

1. explicit ownership, accountability, decisions and measurable outputs;
2. recurring responsibilities and deliverables;
3. stated scope, authority and people leadership;
4. title signal;
5. supporting nouns and keywords.

A keyword alone is never sufficient evidence for a product, platform, authority or seniority conclusion.

## 3. Dimensions

### 3.1 Role archetype

One of:

```text
client_relationship_coverage
sales_origination_distribution
customer_service_acquisition
investment_research_strategy
portfolio_management_asset_allocation
markets_sales_trading_structuring
credit_underwriting_risk
risk_compliance_financial_crime
operations_settlement_servicing
product_management_governance
software_application_engineering
platform_cloud_reliability_engineering
technology_architecture_delivery
data_ai_quantitative_analytics
finance_accounting_treasury_control
strategy_transformation_programme
people_marketing_corporate_services
other_unknown
```

Select from dominant ownership and output. Do not classify from the company or one isolated title keyword.

### 3.2 Work profile

One primary activity and up to two distinct secondary activities:

```text
client_relationships, sales_origination, research_analysis,
investment_decisions, trading_execution, product_advisory,
product_ownership, technology_build, data_analytics,
operations_processing, risk_control, compliance_governance,
strategy_transformation, reporting_coordination, finance_control,
people_leadership, other_unknown
```

Do not promote supporting collaboration or incidental keywords to a primary activity.

### 3.3 Business domain

One of:

```text
retail_banking
commercial_corporate_banking
wealth_private_banking
capital_markets
asset_management
insurance
fintech_payments
technology_services
corporate_enterprise
other_unknown
```

This describes the operating business environment, not the employee's function.

### 3.4 Business products

Zero to two materially worked-on business products:

```text
deposits, mortgages, credit_cards, consumer_lending,
corporate_lending, cash_management, trade_finance, payments,
foreign_exchange, fixed_income, credit_products, equities,
derivatives, investment_funds, structured_products,
insurance_products, wealth_management, private_banking,
portfolio_management, asset_allocation, mutual_funds, unit_trusts,
private_markets
```

Choose a value only where the role repeatedly sells, analyzes, manages, operates, governs or owns that product. Employer industry, a client example or a one-off incident is not enough.

### 3.5 Technology platforms

Zero to two materially owned, engineered, operated or delivered platforms:

```text
business_applications
apis_and_microservices
cloud_platforms
platform_infrastructure
data_platforms
ai_ml_platforms
reliability_observability
trading_systems
```

Programming languages, tools, certifications and ordinary software usage are skills, not platform context. `API` becomes `apis_and_microservices` only when the JD describes an API/microservice platform or ownership of that architecture.

### 3.6 Seniority evidence

The result has three separate fields:

```text
titleLevelSignal
roleLevel
seniorityAlignment
```

`titleLevelSignal` reads the title only:

```text
entry
professional
senior_individual_contributor
manager_or_lead
director_or_head
executive
unknown
```

`roleLevel` uses title plus JD responsibility, authority and leadership. It uses the same controlled values. The title is a prior, not proof.

`seniorityAlignment` is one of:

```text
aligned
title_higher_than_scope
title_lower_than_scope
ambiguous
```

Decision rules:

- title and explicit JD scope agree → `aligned`;
- title is higher but JD only supports narrower delivery → `title_higher_than_scope`;
- JD explicitly supports broader ownership than title → `title_lower_than_scope`;
- evidence is insufficient or contradictory → `ambiguous`;
- a title-only signal may be used as a fallback only when the JD cannot support a final level, never as a reason to invent authority.

### 3.7 Mandate, authority and leadership

Mandate scope:

```text
individual_delivery
workstream_or_project
team_or_function
business_unit_or_region
enterprise
unknown
```

Decision authority:

```text
execution
recommendation
approval
ownership
unknown
```

Leadership:

```text
individual_contributor
informal_influencer
team_lead
people_manager
functional_leader
unknown
```

Do not infer approval or ownership from `support`, `assist`, `partner`, `contribute` or `review` without explicit authority language.

### 3.8 Role risk

Return up to three distinct structural risks:

```text
title_scope_mismatch
seniority_ambiguity
responsibility_ambiguity
leadership_ambiguity
function_context_mismatch
contradictory_scope
```

Each risk has `low`, `medium`, `high` or `unknown` severity. Risks identify ambiguity in the JD, not candidate quality.

## 4. API contract

The TypeSafe request uses structured instructions containing `title`, `description`, `company` and `location`. Product and platform questions are separate. Title-only level, final level and alignment are separate questions. The Worker normalizes, deduplicates and retains backwards-compatible aliases:

```json
{
  "taxonomyVersion": "jev-taxonomy-v2.2",
  "businessContext": {
    "businessDomain": "capital_markets",
    "businessProducts": ["fixed_income"],
    "technologyPlatforms": ["trading_systems"],
    "productOrPlatformContext": ["fixed_income", "trading_systems"]
  },
  "mandate": {
    "titleLevelSignal": "director_or_head",
    "roleLevel": "senior_individual_contributor",
    "seniorityAlignment": "title_higher_than_scope",
    "mandateScope": "workstream_or_project",
    "decisionAuthority": "recommendation"
  }
}
```

## 5. UI and cache

The UI displays business products and technology platforms separately. Empty arrays display `Not materially specified`; controlled `unknown` displays `Unknown`. It displays title signal beside final role level and their alignment.

The browser cache key is `linkedin-jev-analysis-v2.2`; changing the JD fingerprint or taxonomy version forces a new analysis.
