# JEV Taxonomy v3.1

This taxonomy is the controlled vocabulary used by the Cloudflare Worker and the browser card. The model must classify from recurring responsibilities and outputs, not title prestige, requirements, employer industry, or generic boilerplate.

## Design rules

1. Use one primary archetype. Use `insufficient_evidence` when the substantive responsibility core is too thin or contradictory; use `not_applicable` for a programme/intake, multiple-role or non-job posting.
2. Long IDs are intentional: the identifier itself carries semantic context to the model.
3. Entity signals are evidence only. They never override the model's `servedBusinessLine` or `operatingContext` answer.
4. Primary Activity is derived from the archetype's dominant work product; people leadership overrides only when explicit people-management evidence and a high people-leadership signal both exist.
5. Product/platform noul values use real TypeSafe `{type:"noul", noul:<number>}` answers. Product threshold is 0.80 for TE/CF and 0.65 otherwise; platform threshold is 0.65 for TE/PS and 0.80 otherwise.

## Controlled archetypes

| Family | IDs |
|---|---|
| CS | `CS1_relationship_management`, `CS2_acquisition_direct_sales`, `CS3_product_specialist_advisory`, `CS4_customer_service_frontline`, `CS5_investment_banking_advisory`, `CS6_markets_sales_trading` |
| IR | `IR1_investment_research`, `IR2_portfolio_management` |
| RC | `RC1_credit_risk`, `RC2_financial_crime`, `RC3_compliance_legal`, `RC4_enterprise_risk`, `RC5_internal_audit` |
| OP | `OP1_banking_operations`, `OP2_securities_fund_services` |
| PS | `PS1_product_management`, `PS2_business_analysis_change`, `PS3_strategy_business_management`, `PS4_experience_design_research` |
| TE | `TE1_software_engineering`, `TE2_platform_infrastructure_sre`, `TE3_architecture`, `TE4_cyber_security`, `TE5_data_engineering_analytics`, `TE6_ai_ml_quant`, `TE7_technology_management_delivery` |
| CF | `CF1_finance_accounting`, `CF2_treasury_alm`, `CF3_hr_people`, `CF4_marketing_communications`, `CF5_corporate_services`, `CF6_actuarial_insurance_technical` |

Special values: `other_profession`, `insufficient_evidence`, `not_applicable`.

## Parser contract

- API: `POST /api/jev/analyze`, same-origin only.
- Provider: TypeSafe SystemOne, model `jev-1.13.0`.
- Response: `schemaVersion: 5`, `taxonomyVersion: jev-taxonomy-v3.1`.
- Structured JD sections are sent once. Legacy `servedBusinessLineHint` and `operatingContextHint` are accepted for compatibility but omitted from provider state and never used as output overrides.
- Quality flags such as unresolved placeholders, generic responsibilities, requirements-dominated text and machine-translation defects are deterministic, capped at medium severity, and are not model archetypes.
