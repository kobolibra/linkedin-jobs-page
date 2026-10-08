# JEV Taxonomy v4.4.1

> Generated from jev-taxonomy.mjs by node gen-taxonomy-doc.mjs. Do not edit by hand.

Exactly five visible dimensions: Role Archetype (occupational mandate), Primary Activity (recurring output), Business Line (directly served business), Leadership Level (actual authority), and Role Risk (supported structural concerns). Each is judged independently.

## Role Archetype

Classify the durable occupational mandate from recurring responsibilities and accountable outputs. Title, qualifications, tools and employer marketing cannot override the work. Distinguish adjacent categories using their exclusions. Generic conduct/compliance/leadership boilerplate does not define a profession. Mixed duties are normal: choose the dominant mandate only when supported; otherwise insufficient_evidence. Classify each dimension independently.

| Code | Label | Family | Boundary |
|---|---|---|---|
| `CS1_relationship_management` | Relationship Management & Coverage | Client & Commercial | Relationship Management & Coverage. Owns an ongoing client book, retention, wallet share and coverage plan. Some acquisition is normal; use direct sales when new-client conversion dominates. |
| `CS2_acquisition_direct_sales` | Acquisition & Direct Sales | Client & Commercial | Acquisition & Direct Sales. Owns prospecting, acquisition funnels, sales targets and conversion. Not service requests, existing-book coverage or marketing campaign design. |
| `CS3_product_specialist_advisory` | Product Specialist & Advisory | Client & Commercial | Product Specialist & Advisory. Provides specialist client/product advice, proposals and solution structuring alongside coverage teams. Not product roadmap ownership, legal advice or investment-banking deal execution. |
| `CS4_customer_service_frontline` | Customer Service & Frontline | Client & Commercial | Customer Service & Frontline. Resolves customer enquiries and service requests through branches or contact centres. Not a sales quota role or back-office processing. |
| `CS5_investment_banking_advisory` | Investment Banking & Financing Origination | Client & Commercial | Investment Banking & Financing Origination. Originates and executes M&A, ECM, DCM or corporate-finance mandates, valuations and transaction advice. Not ordinary corporate lending coverage or trading. |
| `CS6_markets_sales` | Markets Sales | Client & Commercial | Markets Sales. Distributes traded products, covers investors and originates client flow or solutions. Not taking trading-book risk, market-making or post-trade settlement. |
| `IR1_investment_research` | Investment Research & Strategy | Investment, Markets & Research | Investment Research & Strategy. Produces security, issuer or macro investment views and recommendations. Not credit approval, routine BI reporting or portfolio investment decisions. |
| `IR2_portfolio_management` | Portfolio Management | Investment, Markets & Research | Portfolio Management. Owns investment selection, allocation, portfolio construction and performance for managed assets. Not fund accounting or sales of investment products. |
| `IR3_quantitative_research` | Quantitative Research & Modelling | Investment, Markets & Research | Quantitative Research & Modelling. Builds pricing, trading, investment, capital or financial-risk models and libraries. Not general-purpose ML, data pipelines or independent validation of others’ models. |
| `IR4_trading` | Trading & Market Making | Investment, Markets & Research | Trading & Market Making. Owns pricing, execution, hedging, market-making or trading-book risk. Not markets sales, investment research or settlement operations. |
| `RC1_credit_risk` | Credit Risk & Underwriting | Risk, Compliance & Audit | Credit Risk & Underwriting. Owns borrower credit analysis, approval, limits, monitoring or restructuring of lending exposure. Not insurance underwriting or investment credit research. |
| `RC2_financial_crime` | Financial Crime, KYC & AML | Risk, Compliance & Audit | Financial Crime, KYC & AML. Owns due diligence, sanctions, AML monitoring or financial-crime investigations. Routine account setup without substantive due diligence is client onboarding. |
| `RC3_compliance` | Compliance & Regulatory Advisory | Risk, Compliance & Audit | Compliance & Regulatory Advisory. Owns conduct, regulatory compliance policy, monitoring or advice. Not legal counsel, financial-crime specialism or independent internal audit. |
| `RC4_enterprise_risk` | Enterprise, Operational & Business Risk | Risk, Compliance & Audit | Enterprise, Operational & Business Risk. Owns risk appetite, exposure oversight, first/second-line controls or risk frameworks. Not universal employee conduct obligations, credit underwriting or independent audit. |
| `RC5_internal_audit` | Internal Audit | Risk, Compliance & Audit | Internal Audit. Provides independent audit assurance, findings and remediation assessment. Not first-line control execution or routine compliance monitoring. |
| `RC6_model_validation` | Independent Model Validation | Risk, Compliance & Audit | Independent Model Validation. Independently challenges model assumptions, methodology, implementation and limitations, producing validation findings. Not developing or maintaining the same models. |
| `OP1_banking_operations` | Banking Operations | Operations & Securities Services | Banking Operations. Processes and controls payments, loans, deposits, trade-finance or cash transactions. Not selling these products or defining product strategy. |
| `OP2_securities_fund_services` | Securities & Fund Operations | Operations & Securities Services | Securities & Fund Operations. Produces custody, settlement, NAV, fund accounting, transfer agency or asset-servicing outputs. Not the bank’s own corporate accounts or investment decisions. |
| `OP3_client_onboarding` | Client Onboarding & Implementation | Operations & Securities Services | Client Onboarding & Implementation. Owns client setup, account opening, documentation or implementation of an agreed service. Not AML investigation or new-client sales; use those when they dominate. |
| `PS1_product_management` | Product Management | Product, Change, Strategy & Design | Product Management. Owns proposition, roadmap, lifecycle, prioritisation and product outcomes. Not a product sales specialist or delivery coordinator without product decisions. |
| `PS2_business_analysis_change` | Business Analysis & Requirements | Product, Change, Strategy & Design | Business Analysis & Requirements. Owns business requirements, process mapping, user stories and acceptance criteria. Not programme budget/milestones or product-roadmap decisions. |
| `PS3_strategy_business_management` | Strategy & Business Management | Product, Change, Strategy & Design | Strategy & Business Management. Owns strategy, business planning, operating performance or COO/business-manager coordination. Not project delivery, accounting or hands-on BI as the dominant profession. |
| `PS4_experience_design_research` | Experience Design & Research | Product, Change, Strategy & Design | Experience Design & Research. Owns user research, UX/UI, journeys and service design. Not general marketing or software implementation. |
| `PS5_project_programme_change` | Project, Programme & Change Management | Product, Change, Strategy & Design | Project, Programme & Change Management. Owns delivery milestones, dependencies, budget, implementation or change adoption. Not requirements alone; use technology delivery for an explicitly technology-led mandate. |
| `TE1_software_engineering` | Software Engineering | Technology & Engineering | Software Engineering. Builds, tests and maintains application code/services. Not infrastructure operations, standalone model research or cross-system architecture authority. |
| `TE2_platform_infrastructure_sre` | Platform, Infrastructure & SRE | Technology & Engineering | Platform, Infrastructure & SRE. Builds/operates cloud, infrastructure, networks or production reliability. Not application feature development or cybersecurity as the primary mandate. |
| `TE3_architecture` | Technology Architecture | Technology & Engineering | Technology Architecture. Owns cross-system architecture, technical standards and design authority. Not merely contributing design as a software developer. |
| `TE4_cyber_security` | Cybersecurity | Technology & Engineering | Cybersecurity. Owns security engineering, cyber defence, identity, threats or security architecture. Not general operational risk or employee security awareness. |
| `TE5_data_engineering` | Data Engineering | Technology & Engineering | Data Engineering. Owns pipelines, datasets, warehouses, data platforms, lineage and reliability. AI/vector data preparation remains data engineering unless model development dominates. |
| `TE6_data_science_ml` | Data Science & Machine Learning | Technology & Engineering | Data Science & Machine Learning. Develops statistical/ML models, experiments, predictive systems or AI model evaluation. Financial pricing/trading/risk models belong to quantitative research; dashboards to BI. |
| `TE7_technology_management_delivery` | Technology Management & Delivery | Technology & Engineering | Technology Management & Delivery. Owns technology delivery, service/engineering management, technical programmes or IT operating outcomes. Management level is judged separately; Head/VP alone is not evidence. |
| `TE8_data_analytics_bi` | Data Analytics & Business Intelligence | Technology & Engineering | Data Analytics & Business Intelligence. Owns SQL analysis, dashboards, metrics, BI or descriptive decision support. Not pipelines, predictive models or business strategy without substantive analytical outputs. |
| `CF1_finance_accounting` | Finance, Accounting & FP&A | Corporate Functions & Insurance Technical | Finance, Accounting & FP&A. Owns the employer’s accounting, financial control, reporting, budgeting or forecasting. Client-fund NAV/accounting belongs to fund operations. |
| `CF2_treasury_alm` | Treasury & ALM | Corporate Functions & Insurance Technical | Treasury & ALM. Owns the institution’s funding, liquidity, capital and balance-sheet decisions. Not selling cash-management products or coding liquidity models. |
| `CF3_hr_people` | HR & People Services | Corporate Functions & Insurance Technical | HR & People Services. Owns HR, recruitment, reward, talent, learning or organisation services. Hiring one’s own team does not make a manager an HR professional. |
| `CF4_marketing_communications` | Marketing & Communications | Corporate Functions & Insurance Technical | Marketing & Communications. Owns brand, campaigns, communications, content or marketing effectiveness. Not direct sales conversion or predominantly analytical BI outputs. |
| `CF5_corporate_services` | Administration & Corporate Services | Corporate Functions & Insurance Technical | Administration & Corporate Services. Owns procurement, vendor administration, workplace, executive support or corporate services. Managing vendor contracts does not imply outsourced employment. |
| `CF6_actuarial` | Actuarial & Insurance Pricing | Corporate Functions & Insurance Technical | Actuarial & Insurance Pricing. Owns actuarial valuation, reserving, pricing methodology, solvency or insurance capital models. Not individual-policy underwriting or claims handling. |
| `CF7_legal_counsel` | Legal Counsel | Corporate Functions & Insurance Technical | Legal Counsel. Owns legal advice, contracts, litigation or legal risk. Not compliance monitoring; negotiating contracts is not evidence of fixed-term employment. |
| `CF8_insurance_underwriting` | Insurance Underwriting | Corporate Functions & Insurance Technical | Insurance Underwriting. Assesses insured risks and decides policy acceptance, coverage, terms or premiums. Not credit lending decisions or actuarial model methodology. |
| `CF9_insurance_claims` | Insurance Claims | Corporate Functions & Insurance Technical | Insurance Claims. Assesses claims, coverage, loss evidence, settlement or claims disputes. Not insurance sales or underwriting new policies. |
| `other_profession` | Other Clear Profession |  | Other Clear Profession. A clear recurring profession outside the listed taxonomy. Do not force non-financial vacancies into banking categories. |
| `insufficient_evidence` | Insufficient Evidence |  | Insufficient Evidence. No defensible dominant profession from role-specific duties, including genuinely unresolved mixed mandates. |
| `not_applicable` | Not Applicable |  | Not Applicable. Only non-job content; not a substitute for missing evidence in a real vacancy. |

## Primary Activity

Choose the dominant recurring work product, not title or an incidental tool. Separate client coverage, sales and solution advice; research and investment decisions; credit approval and risk oversight; compliance monitoring, policy/legal advice and independent audit. Separate banking transaction processing and client-fund operations; pipelines, dashboards, model development and independent model validation. Product managers own lifecycle decisions; analysts own requirements; project managers own delivery. Use the JD’s output even when it is unusual for the occupation. Do not infer activity from archetype. If there is no defensible dominant output, use not_determinable.

| Code | Label | Criterion |
|---|---|---|
| `client_relationship_management` | Client Portfolio Coverage | Owns retention, service and wallet share of an existing client portfolio; not new-client conversion. |
| `sales_and_business_development` | New Business Origination | Prospects for and converts new clients, sales, mandates or distribution opportunities; not routine servicing. |
| `advisory_and_solution_structuring` | Advisory & Solution Structuring | Designs or advises on specific client financing, investment or product solutions; not roadmap ownership. |
| `trading_and_execution` | Pricing, Trading & Execution | Quotes, prices, executes, hedges or market-makes traded instruments; not post-trade processing. |
| `frontline_customer_service` | Customer Service | Resolves customer requests through frontline service channels; not owning sales targets. |
| `investment_research_and_recommendations` | Investment Research & Recommendations | Produces investment, issuer, equity, credit or macro views and recommendations; not lending approval. |
| `portfolio_and_investment_management` | Investment & Portfolio Decisions | Makes investment-selection, allocation or portfolio-construction decisions for managed assets. |
| `credit_underwriting_and_approval` | Credit Assessment & Approval | Underwrites, approves, monitors or restructures lending exposures; not insurance policies. |
| `risk_management_and_quantification` | Risk Measurement & Oversight | Measures exposures, sets limits/appetite or owns risk frameworks and controls; not independent model validation. |
| `compliance_monitoring_and_investigation` | Compliance Monitoring & Investigation | Performs substantive AML/KYC, sanctions, surveillance, conduct monitoring or investigations. |
| `audit_and_control_testing` | Independent Audit & Assurance | Independently tests controls and produces audit findings; not routine self-checking of one’s own work. |
| `regulatory_legal_and_policy_advisory` | Regulatory, Legal & Policy Advice | Interprets law/regulation, drafts legal advice/contracts or owns policy; not monitoring transactions. |
| `banking_transaction_operations` | Banking Transaction Processing | Processes and controls payments, loans, deposits, cash or trade-finance transactions. |
| `securities_and_fund_operations` | Fund & Securities Operations | Produces NAV/fund accounts, settlement, custody, transfer-agency or asset-servicing outputs. |
| `client_onboarding_and_implementation` | Client Onboarding & Implementation | Implements client services, account setup and documentation; not substantive AML investigation or acquisition. |
| `finance_accounting_and_control` | Accounting, Reporting & Control | Produces corporate accounts, financial control or statutory/regulatory financial reporting; not client-fund NAV. |
| `financial_planning_and_analysis` | Budgeting, Forecasting & FP&A | Produces budgets, forecasts, variance analysis or financial performance decisions; not bookkeeping. |
| `treasury_and_alm_management` | Funding, Liquidity & ALM | Manages own-institution funding, liquidity, capital and balance sheet; not client cash-product sales. |
| `insurance_actuarial_and_pricing` | Actuarial Valuation & Pricing | Develops actuarial pricing, reserving, valuation or solvency calculations; not individual policy decisions. |
| `insurance_underwriting` | Insurance Risk Acceptance | Decides insurance policy acceptance, coverage, terms and premiums. |
| `insurance_claims_assessment` | Claims Assessment & Settlement | Evaluates claims evidence, policy coverage, losses and settlement. |
| `people_and_organisation_services` | People & Organisation Services | Delivers HR, recruitment, talent, reward, learning or organisational services. |
| `marketing_and_communications` | Campaigns & Communications | Delivers marketing campaigns, brand, communications, content or public relations. |
| `administration_and_business_support` | Administration & Corporate Support | Delivers procurement, workplace, vendor administration or corporate support. |
| `product_management_and_roadmap` | Product Strategy & Roadmap | Owns product proposition, roadmap, lifecycle, prioritisation and product outcomes. |
| `business_analysis_and_requirements` | Requirements & Process Analysis | Defines requirements, processes, operating models, user stories and acceptance criteria. |
| `project_change_and_delivery` | Project Delivery & Change | Owns implementation, milestones, dependencies, programme/change delivery and adoption. |
| `strategy_and_business_management` | Strategy & Business Planning | Drives strategy, planning, business performance and executive decision support. |
| `experience_design_and_user_research` | Experience Design & User Research | Produces UX/UI, journeys, service design or user research. |
| `software_engineering` | Software Development & Testing | Builds, tests, deploys and maintains application software/services. |
| `platform_infrastructure_and_sre` | Platform Engineering & Reliability | Builds or operates cloud, infrastructure, networks, DevOps/SRE or production platforms. |
| `architecture_and_technical_design` | Architecture & Technical Design | Owns cross-system design, technical standards or architecture authority. |
| `cybersecurity_operations` | Security Engineering & Defence | Delivers cyber defence, security engineering, threat detection, identity or SOC operations. |
| `data_engineering` | Data Pipelines & Platforms | Builds pipelines, warehouses, datasets, lineage, quality and data infrastructure. |
| `data_analytics_and_bi` | Analytics, Metrics & BI | Produces dashboards, descriptive analysis, metrics and decision-support reporting. |
| `data_science_quant_and_modelling` | Statistical, ML & Quantitative Modelling | Builds predictive, statistical, ML, pricing, investment or financial-risk models. Financial/nonfinancial domain is distinguished by Role Archetype. |
| `independent_model_validation` | Independent Model Validation | Independently challenges others’ model assumptions, methodology, implementation and performance. Not model development. |
| `not_determinable` | Not Determinable | The JD cannot support a defensible dominant recurring output. Do not substitute an archetype’s usual activity. |

## Business Line

Classify the business that this role directly serves, independently of its profession. Product/service mandate first, client segment second: Transaction banking, securities services, markets, investment banking and asset management must be separated by outputs. A fund accountant serving an asset manager is securities services, not automatically asset management. A software engineer for a named markets desk is global_markets. Credit portfolio data does not by itself establish corporate versus retail banking. Do not infer from employer brand, marketing, industry of counterparties or a list of stakeholders. Explicit group/shared mandate => enterprise_wide; unspecified internal team => not_stated. Multi-line requires material responsibility for multiple lines, not occasional collaboration.

| Code | Label | Criterion |
|---|---|---|
| `personal_retail` | Personal / Retail Banking | Everyday consumer banking, deposits, cards or mortgages for individuals. |
| `wealth_and_affluent_banking` | Wealth & Affluent Banking | Explicit wealth, premier, affluent or HNW banking; wealth alone does not establish private banking. |
| `private_banking` | Private Banking | Explicit private-banking team/mandate or UHNW bespoke private-bank service. Family office or wealthy clients alone do not prove private banking. |
| `commercial_sme` | Commercial / SME Banking | Small, owner-managed, SME or mid-market business clients. |
| `corporate_banking` | Corporate Banking | Corporate coverage/lending for large companies or multinational corporates. Not the financial industry of an incidental counterparty. |
| `institutional_banking` | Institutional Banking | Coverage/banking for financial institutions or public-sector institutions: banks, insurers, asset managers, sovereigns. Product lines take precedence when explicit. |
| `transaction_banking` | Transaction Banking | Payments, cash management, trade finance, working capital or client treasury services as the dominant product line, regardless of client size. Not own-bank Treasury/ALM. |
| `securities_services` | Securities Services | Custody, clearing, settlement, client-fund administration/accounting or asset servicing. Not management of the fund’s investment portfolio. |
| `global_markets` | Global Markets | Traded-product sales, trading, structuring, markets research or directly supporting a named markets desk/business. |
| `investment_banking` | Investment Banking | M&A, ECM, DCM, leveraged finance or corporate-finance deal advisory/origination. |
| `asset_management` | Asset Management | Investment portfolios/funds/mandates as the explicitly employing or supported business. Not a fund administrator merely serving asset managers. |
| `insurance` | Insurance | Insurance underwriting, broking, claims or explicitly supported insurance operations. |
| `enterprise_wide` | Enterprise-wide | Explicit group-wide/shared corporate mandate, including own-institution finance/treasury/HR. Internal technology/risk/operations without stated coverage is not enough. |
| `multi_line` | Multiple Business Lines | At least two distinct, explicit and material served lines with no dominant one. Lists of collaborators or company marketing do not qualify. |
| `other_business_line` | Other Explicit Business | A clearly stated non-listed business, such as industrial/manufacturing or professional-services work. Do not force it into a banking line. |
| `not_stated` | Not Stated | The JD does not establish the directly served line; employer brand or department name alone is insufficient. |
| `not_applicable` | Not Applicable | Only non-job content. |

## Leadership Level

Measure actual management accountability, not grade or seniority. VP/AVP/Director/Head can be an IC. Past leadership experience in requirements is not a current reporting structure. Generic bank conduct/People & Talent boilerplate is not role-specific management evidence. Distinguish people management from delivery leadership and mentoring; manager_of_managers requires explicit subordinate managers.

| Code | Label | Criterion |
|---|---|---|
| `individual_contributor` | Individual Contributor | Substantive hands-on responsibilities establish an individual contributor mandate without stated team/people ownership. Do not use merely because a thin JD is silent about management. |
| `informal_mentor_or_lead` | Mentor / Informal Lead | Explicit recurring mentoring, coaching or technical guidance without owning a team or workstream. Stakeholder influence alone is insufficient. |
| `team_lead` | Team / Workstream Lead | Explicit accountability for a team/squad/workstream’s work, priorities or delivery without formal line-management powers. Generic “lead initiatives” or conduct boilerplate is insufficient. |
| `people_manager` | People Manager | Explicit current direct reports or authority for their hiring, performance reviews, appraisal or career development. Managing projects, clients, vendors, budgets or recruitment as an HR task is not people management. |
| `manager_of_managers` | Manager of Managers | Explicit line-management of managers/team leaders who themselves manage staff. Multiple projects, teams, geography, “Head”, “Director” or function ownership alone is insufficient. |
| `not_stated` | Not Stated | Insufficient or conflicting evidence of the role’s actual leadership mandate; distinguish unknown from a supported IC role. |
| `not_applicable` | Not Applicable | Non-job content only. |

## Role Risk

| Code | Label | Severity | Threshold | Evidence rule | Useful follow-up |
|---|---|---|---|---|---|
| `title_function_mismatch` | Title–Duties Mismatch | medium | 0.85 | A substantial mismatch between the title’s occupational promise and dominant actual duties. Grade inflation alone, a broad title or legitimate adjacent duties are not a mismatch. | Clarify the actual mandate behind the title. |
| `overloaded_scope` | Scope & Priorities Need Clarification | medium | 0.85 | Several materially separate mandates are simultaneously assigned without clear priority, ownership or resourcing. Routine cross-functional collaboration, end-to-end work and senior breadth are not enough; a JD cannot prove workload is unrealistic. | Clarify priorities, ownership and resourcing across the stated mandates. |
| `pooled_or_multi_role_posting` | Pooled or Multiple Distinct Roles | medium | 0.8 | Explicit pipeline/evergreen or materially different roles; not a graduate programme, multiple seats, or alternative locations for the same role. | Confirm the specific open vacancy and its responsibilities. |
| `non_permanent_or_outsourced` | Fixed-term / Contingent Employment | medium | 0.85 | This advertised job itself has fixed-term, temporary, contractor, agency/payroll or secondment terms. Contract drafting, vendor/outsourcing oversight, ordinary employment contracts and past contractor experience are not evidence. Explicit permanent employment or negation rules this out. | Confirm duration, employing entity and renewal/conversion terms. |
| `thin_or_template_jd` | Limited Role-specific Evidence | low | 0.85 | Responsibilities are too sparse, vague or template-dominated to establish the actual mandate. Specific short descriptions can be sufficient; benefits/EEO boilerplate alongside clear duties is not itself a risk. | Request concrete responsibilities and expected outputs. |

## Runtime safeguards

- Each classification has a short label and, when supported, a source passage selected from the actual JD. Evidence selections use existing Choice primitives, not generated explanations. Source selection is itself a model judgement, not proof that a label is correct.
- Business-line assignment requires explicit-context support >= 0.8 and a non-conflicting classification >= 0.5. Multi-line also requires independent support for multiple materially served lines; KYC/credit/portfolio objects do not establish multiple lines.
- Evidence-selection confidence measures which passage to cite; it does not replace independent classification confidence. Several valid source passages can split the selection probabilities. Only a valid selected source ID with a finite positive confidence is used.
- Missing/invalid answers and probabilities stay unknown; neither a missing answer nor a 0.5 noul is affirmative evidence.
- No archetype-to-activity default. Weak activity answers below 0.35 abstain; other low-confidence/close alternatives remain visibly uncertain.
- Leadership claims require a selected source passage plus explicit evidence nouls at least 0.8. Manager-of-managers also requires people-management support. Downgrades clear the rejected confidence.
- No automatic IC inference from missing management answers. A real but underspecified vacancy uses Not Stated, not Not Applicable.
- Employment and pooled-vacancy flags require both a supported judgement and a selected source passage. Keywords never promote risk to 100%.
- Unknown risk assessment is distinct from no supported structural flags. Flags are questions to clarify, not conclusions about employer quality, actual workload or legal status.
- Non-job content neutralises all dimensions and removes their evidence/candidates. Insufficient duties suppress profession/activity/leadership guesses; a directly evidenced business line can remain.
- Thresholds are conservative engineering gates, not measured accuracy guarantees. Model quality must be evaluated separately on labelled real JDs.
- v4.4.1 uses a new frontend cache namespace. Retired broad role codes are rejected instead of silently assigned a narrower meaning. Raw jobs, lifecycle values and scraping are unchanged.
