# JEV Next-Level Taxonomy

## Evidence base

This design is derived from the actual JD corpus rather than from an abstract taxonomy exercise.

- Canonical jobs: 9,817
- Jobs with linked JD records: 1,705
- Successful semantic analyses used here: **1,391**
- Excluded unresolved records: 314
- Active jobs represented in the broader JD corpus: 1,008
- Main employer concentration: HSBC, Standard Chartered, DBS, Citi, JPMorgan, UBS, Morgan Stanley, Fidelity, Goldman Sachs and related financial-services employers

The 1,391 successful analyses were used to examine:

- role-family distribution;
- activity combinations;
- business context;
- role level and mandate;
- leadership patterns;
- structural-risk frequency;
- long-tail and label instability.

---

# 1. The important finding: the previous design was at the wrong abstraction level

The previous proposals had the right general topics, but they mixed several different abstraction levels:

```text
broad function
specific profession
work activity
product exposure
seniority
authority
leadership
risk
```

They also allowed too much label freedom. In the successful semantic output:

- `roleArchetype` produced **904 distinct strings** across 1,391 analyses;
- `subFunctions` produced more than 100 variants, including unstable synonyms and implementation details;
- `productExposure` produced more than 2,000 observed values because the model mixed financial products, platforms, tools, and technologies;
- a single `primaryFunction` still grouped very different careers together.

This is not evidence that the corpus needs hundreds of categories. It is evidence that the taxonomy must be **hierarchical and controlled**.

The correct next-level solution is:

```text
controlled role archetype
+ controlled work profile
+ business/product context
+ mandate and authority
+ leadership level
+ independent role risk
```

Not free-text archetypes and not a flat list of dozens of labels.

---

# 2. What the actual corpus contains

## 2.1 Role-family concentration

Successful semantic distribution:

| Role family | Count | Share |
|---|---:|---:|
| Client & Commercial | 566 | 40.7% |
| Technology Engineering | 427 | 30.7% |
| Risk, Compliance & Legal | 113 | 8.1% |
| Operations & Service | 99 | 7.1% |
| Product, Strategy & Transformation | 65 | 4.7% |
| Markets, Investment & Research | 61 | 4.4% |
| Data, AI & Analytics | 29 | 2.1% |
| Finance, Accounting & Treasury | 23 | 1.7% |
| People, Marketing & Corporate Services | 8 | 0.6% |

The existing nine-family top level is broadly defensible. The problem is that it is not sufficiently discriminative below the top level.

## 2.2 The largest hidden mixtures

### Client & Commercial

This single family contains materially different jobs:

- retail and priority relationship management;
- wealth and private-banking coverage;
- corporate and commercial relationship management;
- customer acquisition and contact-centre work;
- sales, origination and distribution;
- treasury and transaction-banking sales;
- product specialists and investment advisors;
- client onboarding and servicing.

These roles should not be represented by one generic `client_commercial` label.

### Technology Engineering

This family contains at least four distinct professional tracks:

- application and software engineering;
- platform, cloud and infrastructure engineering;
- site reliability, production support and service operations;
- architecture, technical delivery and engineering leadership.

A generic `technology_engineering` label has insufficient granularity for the actual corpus.

### Risk, Compliance & Legal

This family contains distinct control professions:

- KYC/CDD and onboarding controls;
- AML, sanctions and financial-crime investigations;
- compliance advisory and monitoring;
- surveillance and market conduct;
- product control and valuation control;
- credit analysis and credit risk;
- data, technology and operational risk;
- legal and investment-management legal work.

### Markets, Investment & Research

This family contains distinct roles:

- equity, fixed-income and macro research;
- portfolio management and asset allocation;
- investment strategy;
- sales and trading;
- structuring and quantitative markets;
- investment banking and corporate finance.

### Operations & Service

This family contains:

- settlements and clearing;
- fund operations and fund accounting;
- trade and transaction operations;
- cash and trade operations;
- middle-office and product operations;
- branch and client servicing;
- service-management operations.

These are different enough that a single “operations” label is not useful for comparison.

---

# 3. Final JEV architecture

The recommended production JEV has **six analytical dimensions**. Some dimensions contain one primary controlled field and a small number of bounded secondary fields.

```text
1. Role Archetype
2. Work Profile
3. Business Context
4. Mandate & Authority
5. Leadership Responsibility
6. Role Risk
```

This deliberately excludes:

- candidate requirements;
- salary or work arrangement;
- model confidence or evidence quality dashboards;
- direct reports;
- candidate fit.

The six dimensions are sufficient because they are **orthogonal**:

```text
Role Archetype    = what profession this is
Work Profile      = what work is performed
Business Context  = where the work operates
Mandate & Authority= what scope and authority it carries
Leadership        = how it leads people or teams
Role Risk         = what may be misleading in the JD
```

---

# 4. Dimension 1 — Role Archetype

## Core question

> What profession or role archetype is this JD actually hiring for?

This replaces the combination of an overly broad `primaryFunction` and an uncontrolled `subFunctions` list.

## Controlled values

Use exactly one value from the following 17-category taxonomy:

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
```

Implementation note: remove the accidental whitespace before `data_ai_quantitative_analytics` when encoding the enum.

The production enum should use all 17 values because the corpus shows these professions as materially distinct.

## Why these categories are needed

| Archetype | Why it must be separate |
|---|---|
| `client_relationship_coverage` | Owns client relationships and coverage, not necessarily product sales |
| `sales_origination_distribution` | Generates, structures or distributes business/revenue |
| `customer_service_acquisition` | Handles service, contact-centre, frontline or acquisition work |
| `investment_research_strategy` | Produces research, market views and investment recommendations |
| `portfolio_management_asset_allocation` | Makes or supports portfolio and allocation decisions |
| `markets_sales_trading_structuring` | Operates in sales, trading, structuring or market execution |
| `credit_underwriting_risk` | Assesses, underwrites or monitors credit exposure |
| `risk_compliance_financial_crime` | Performs control, compliance, AML, sanctions, surveillance or investigations |
| `operations_settlement_servicing` | Executes post-trade, transaction, fund or client-service processes |
| `product_management_governance` | Owns product definition, lifecycle, governance or product outcomes |
| `software_application_engineering` | Builds and maintains business applications and software systems |
| `platform_cloud_reliability_engineering` | Builds platforms, cloud, infrastructure, SRE or production reliability |
| `technology_architecture_delivery` | Owns architecture, technical delivery, programme delivery or solution design |
| `data_ai_quantitative_analytics` | Performs data engineering, AI/ML, quantitative or advanced analytics work |
| `finance_accounting_treasury_control` | Performs financial control, accounting, treasury, FP&A or actuarial-finance work |
| `strategy_transformation_programme` | Drives enterprise change, programme, transformation or strategic execution |
| `people_marketing_corporate_services` | Covers HR, recruitment, marketing and corporate services |

## Archetype selection rule

Choose the archetype from the role's **dominant ownership and output**, not from the company, title, or one isolated keyword.

Examples:

```text
Product Owner, Digital Banking
→ product_management_governance

Senior Platform Engineer
→ platform_cloud_reliability_engineering

Corporate Relationship Manager
→ client_relationship_coverage

AML Investigations Associate
→ risk_compliance_financial_crime

Fixed Income Portfolio Manager
→ portfolio_management_asset_allocation
```

## Do not use

Do not create separate archetypes for:

- Senior vs Associate;
- a single programming language;
- a single product unless the product changes the profession;
- employer-specific programme names;
- every title variant;
- free-text role names.

Those belong to other dimensions or to raw metadata.

---

# 5. Dimension 2 — Work Profile

## Core question

> What kind of work does the role perform, regardless of its title?

Role archetype identifies the profession. Work Profile describes the actual work mix, especially for hybrid jobs.

## Output structure

```json
{
  "primaryActivity": "client_relationships",
  "secondaryActivities": ["sales_origination", "product_advisory"]
}
```

Use one primary activity and at most two secondary activities.

## Controlled activities

```text
client_relationships
sales_origination
research_analysis
investment_decisions
trading_execution
product_advisory
product_ownership
technology_build
data_analytics
operations_processing
risk_control
compliance_governance
strategy_transformation
reporting_coordination
finance_control
people_leadership
```

`technology_build` replaces a broad `technology_delivery` label and is intentionally distinct from `product_ownership` and `strategy_transformation`.

## Activity ranking rules

Rank activities using this order of evidence:

1. explicit ownership or accountability;
2. recurring responsibilities;
3. measurable outputs or decisions;
4. supporting or coordination language.

Do not list four activities merely because four keyword families appear. The output must describe the role's dominant work pattern.

## Why this dimension is necessary

The corpus contains many hybrid roles. For example:

```text
Client relationship + sales + product advisory
Technology build + data analytics + product ownership
Risk control + compliance governance + operations processing
Research analysis + investment decisions + client communication
```

A single archetype cannot represent all of those combinations. Work Profile gives useful multi-dimensional detail without creating hundreds of professions.

---

# 6. Dimension 3 — Business Context

## Core question

> In which business environment and product/platform context does the role operate?

## `businessDomain`

Exactly one:

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

This is more discriminative than the previous `banking` catch-all. The corpus contains enough roles to distinguish retail, commercial/corporate, wealth/private banking, capital markets, asset management and insurance.

## `productOrPlatformContext`

Return zero to three normalized values from the controlled groups below.

### Banking and financial products

```text
deposits
mortgages
credit_cards
consumer_lending
corporate_lending
cash_management
trade_finance
payments
foreign_exchange
fixed_income
credit_products
equities
derivatives
investment_funds
structured_products
insurance_products
```

### Wealth and investment context

```text
wealth_management
private_banking
portfolio_management
asset_allocation
mutual_funds
unit_trusts
private_markets
```

### Technology context

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

## Normalization rules

- Normalize `FX` and `foreign exchange` to `foreign_exchange`.
- Normalize `API`, `APIs`, and API platform language to `apis_and_microservices` when it is a platform context, not merely a skill.
- Do not mix tools, skills and business products in one list.
- Do not return more than three values.
- Only return a product/platform when the role materially works with it.

## Why this is a major improvement

The successful outputs showed many unstable values such as `APIs`, `microservices`, `wealth_management_products`, `retail_banking_products`, `FX`, `foreign_exchange`, and `AI_platforms`. These are not separate arbitrary labels; they need controlled normalization and clear semantic groups.

---

# 7. Dimension 4 — Mandate & Authority

## Core question

> How broad is the role's mandate, and what authority does it actually exercise?

Keep three metrics because the corpus shows they separate roles meaningfully.

## `roleLevel`

```text
entry
professional
senior_individual_contributor
manager_or_lead
director_or_head
executive
unknown
```

## `mandateScope`

```text
individual_delivery
workstream_or_project
team_or_function
business_unit_or_region
enterprise
unknown
```

## `decisionAuthority`

```text
execution
recommendation
approval
ownership
unknown
```

## Rules

- `roleLevel` comes from career level and role expectations.
- `mandateScope` comes from the breadth of responsibility.
- `decisionAuthority` comes only from explicit authority or ownership language.
- `senior_individual_contributor` can have `workstream_or_project` or `team_or_function` scope.
- Do not infer ownership from “support,” “assist,” “partner,” or “contribute.”
- Do not infer approval from “review” unless the JD explicitly states approval or authorization.

## Why this is not redundant

The observed corpus contained all of the following combinations:

```text
senior_individual_contributor + workstream_or_project + recommendation
senior_individual_contributor + team_or_function + ownership
manager_or_lead + workstream_or_project + execution
manager_or_lead + team_or_function + ownership
director_or_head + business_unit_or_region + ownership
```

A single seniority label would lose these distinctions.

---

# 8. Dimension 5 — Leadership Responsibility

## Core question

> What kind of people or team leadership is explicitly part of the role?

Use exactly one value. Do not add `directReports` or any separate management field.

## `leadershipLevel`

```text
individual_contributor
informal_influencer
team_lead
people_manager
functional_leader
unknown
```

## Definitions

- `individual_contributor`: explicit IC language or a clearly non-leadership role;
- `informal_influencer`: mentoring, coordination or matrix influence without team ownership;
- `team_lead`: leads a squad, project team or workstream without clear formal people management;
- `people_manager`: explicit people management, hiring, performance management or team ownership;
- `functional_leader`: owns a function or multiple teams;
- `unknown`: insufficient leadership evidence.

## Rules

- Collaboration is not leadership.
- Mentoring alone is not people management.
- Team leadership does not imply direct reports.
- Silence should not automatically become `individual_contributor`; use `unknown` where the JD provides no reliable signal.

The corpus shows that this single ordinal field is enough to distinguish the meaningful leadership patterns without a management matrix.

---

# 9. Dimension 6 — Role Risk

## Core question

> What structural property of the JD could mislead someone comparing or applying to the role?

## `riskFlags`

Return zero to three ranked risks:

```text
title_scope_mismatch
seniority_ambiguity
responsibility_ambiguity
leadership_ambiguity
function_context_mismatch
contradictory_scope
location_ambiguity
jd_too_short
placeholder_or_test_role
```

## Corpus frequency in successful analyses

| Risk | Count |
|---|---:|
| `jd_too_short` | 355 |
| `seniority_ambiguity` | 168 |
| `title_scope_mismatch` | 165 |
| `responsibility_ambiguity` | 107 |
| `location_ambiguity` | 27 |
| `placeholder_or_test_role` | 6 |
| `function_context_mismatch` | 8 |
| `leadership_ambiguity` | 4 |
| `contradictory_scope` | 1 |

The risk dimension is clearly valuable: structural risks were detected in a large minority of roles, especially short JD records and inconsistent seniority/title signals.

## Important distinction

```text
Role Risk       = a property of the role description
Model metadata  = a property of the analysis process
```

Do not replace Role Risk with confidence or evidence-quality scores in the user-facing JEV result.

---

# 10. Final output contract

```json
{
  "schemaVersion": 2,
  "roleArchetype": "platform_cloud_reliability_engineering",
  "workProfile": {
    "primaryActivity": "technology_build",
    "secondaryActivities": [
      "data_analytics",
      "operations_processing"
    ]
  },
  "businessContext": {
    "businessDomain": "wealth_private_banking",
    "productOrPlatformContext": [
      "cloud_platforms",
      "apis_and_microservices"
    ]
  },
  "mandate": {
    "roleLevel": "senior_individual_contributor",
    "mandateScope": "workstream_or_project",
    "decisionAuthority": "ownership"
  },
  "leadershipLevel": "team_lead",
  "roleRisk": {
    "riskFlags": [
      {
        "code": "seniority_ambiguity",
        "severity": "medium",
        "reason": "The title suggests a senior leadership level, while the responsibilities combine individual delivery with limited team ownership."
      }
    ]
  }
}
```

All labels, values and risk reasons must be professional English. The source JD may be Chinese or English, but the generated JEV content must be English.

---

# 11. Coverage and discrimination assessment

## Coverage

The six dimensions cover the actual JD information that repeatedly appears in this corpus:

- profession and role family;
- work activities;
- business and product context;
- career level;
- mandate breadth;
- decision authority;
- leadership responsibility;
- structural role risk.

They do not depend on a candidate profile or external compensation data.

## Discrimination

The model distinguishes the high-value contrasts present in the corpus:

```text
relationship coverage vs sales origination
customer service vs wealth relationship management
research vs portfolio management
markets sales/trading vs investment research
credit risk vs general compliance
KYC/AML vs market surveillance
operations settlement vs fund accounting
software engineering vs platform/SRE
technology architecture vs application engineering
product management vs programme transformation
senior IC vs people manager
recommendation vs ownership
```

## Granularity

The model is neither too broad nor too fine:

- 17 controlled role archetypes prevent large families from collapsing;
- one primary plus two secondary activities capture hybrid roles;
- normalized product/platform context adds business specificity;
- three mandate metrics preserve meaningful authority differences;
- one leadership level avoids a redundant management matrix;
- up to three risk flags preserve the original risk analysis.

## What must not happen

Do not let the provider create:

- arbitrary new archetypes;
- title-specific categories;
- employer-specific categories;
- unbounded skill lists in `productOrPlatformContext`;
- duplicate synonyms such as `FX` and `foreign_exchange`;
- four or more activity tags;
- a single composite “role score.”

---

# 12. Final recommendation

The previous five-dimension design was directionally correct but still too coarse because it relied on broad `Role Identity` and loosely defined `subFunctions`. The next-level design should use **controlled role archetypes plus orthogonal context and mandate axes**.

The final production JEV should therefore be:

```text
Role Archetype
+ Work Profile
+ Business Context
+ Mandate & Authority
+ Leadership Responsibility
+ Role Risk
```

This is the smallest model that is still comprehensive for the observed corpus and sufficiently discriminative for real job comparison.
