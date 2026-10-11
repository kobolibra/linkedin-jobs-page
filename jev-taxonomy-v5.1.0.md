# JEV Taxonomy v5.1.0

> Generated from jev-taxonomy.mjs by node gen-taxonomy-doc.mjs. Do not edit by hand.

Exactly five visible dimensions: Role Archetype (occupational mandate), Primary Activity (recurring output), Business Line (directly served business), Leadership Level (actual authority), and Role Risk (supported structural concerns, employment terms and operating obligations). Each is judged independently.

## Role Archetype

Classify the durable occupational mandate from recurring responsibilities and accountable outputs. Title, qualifications, tools and employer marketing cannot override the work. Distinguish adjacent categories using their exclusions. Generic conduct/compliance/leadership boilerplate does not define a profession. Mixed duties are normal: choose the dominant mandate only when supported; otherwise insufficient_evidence. Classify each dimension independently. This dimension identifies the durable professional track: which capability and accountable mandate would persist if the employer or business line changed? Do not simply copy the dominant task, grade or served market.

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
| `RC1_credit_risk` | Credit Risk & Underwriting | Risk, Compliance, Audit & Investigations | Credit Risk & Underwriting. Owns borrower credit analysis, approval, limits, monitoring or restructuring of lending exposure. Not insurance underwriting or investment credit research. |
| `RC2_financial_crime` | Financial Crime, KYC & AML | Risk, Compliance, Audit & Investigations | Financial Crime, KYC & AML. Owns due diligence, sanctions, AML monitoring or financial-crime investigations. Routine account setup without substantive due diligence is client onboarding. |
| `RC3_compliance` | Compliance & Regulatory Advisory | Risk, Compliance, Audit & Investigations | Compliance & Regulatory Advisory. Owns conduct, regulatory compliance policy, monitoring or advice. Not legal counsel, financial-crime specialism or independent internal audit. |
| `RC4_enterprise_risk` | Enterprise, Operational & Business Risk | Risk, Compliance, Audit & Investigations | Enterprise, Operational & Business Risk. Owns risk appetite, exposure oversight, first/second-line controls or risk frameworks. Not universal employee conduct obligations, credit underwriting or independent audit. |
| `RC5_internal_audit` | Internal Audit | Risk, Compliance, Audit & Investigations | Internal Audit. Provides independent audit assurance, findings and remediation assessment. Not first-line control execution or routine compliance monitoring. |
| `RC6_model_validation` | Independent Model Validation | Risk, Compliance, Audit & Investigations | Independent Model Validation. Independently challenges model assumptions, methodology, implementation and limitations, producing validation findings. Not developing or maintaining the same models. |
| `RC7_corporate_investigations` | Corporate & Employee Investigations | Risk, Compliance, Audit & Investigations | Corporate & Employee Investigations. Owns investigations into employee misconduct, internal fraud, allegations or wrongdoing affecting the institution, with case findings and fact-finding accountability. Not client AML/KYC/sanctions investigations, independent internal audit or general risk-framework oversight. |
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
| `CF1_finance_accounting` | Finance, Accounting & FP&A | Corporate Functions | Finance, Accounting & FP&A. Owns the employer’s accounting, financial control, reporting, budgeting or forecasting. Client-fund NAV/accounting belongs to fund operations. |
| `CF2_treasury_alm` | Treasury & ALM | Corporate Functions | Treasury & ALM. Owns the institution’s funding, liquidity, capital and balance-sheet decisions. Not selling cash-management products or coding liquidity models. |
| `CF3_hr_people` | HR & People Services | Corporate Functions | HR & People Services. Owns HR, recruitment, reward, talent, learning or organisation services. Hiring one’s own team does not make a manager an HR professional. |
| `CF4_marketing_communications` | Marketing & Communications | Corporate Functions | Marketing & Communications. Owns brand, campaigns, communications, content or marketing effectiveness. Not direct sales conversion or predominantly analytical BI outputs. |
| `CF5_corporate_services` | Administration & Corporate Services | Corporate Functions | Administration & Corporate Services. Owns procurement, vendor administration, workplace, executive support or corporate services. Managing vendor contracts does not imply outsourced employment. |
| `CF6_actuarial` | Actuarial & Insurance Pricing | Insurance Technical | Actuarial & Insurance Pricing. Owns actuarial valuation, reserving, pricing methodology, solvency or insurance capital models. Not individual-policy underwriting or claims handling. |
| `CF7_legal_counsel` | Legal Counsel | Corporate Functions | Legal Counsel. Owns legal advice, contracts, litigation or legal risk. Not compliance monitoring; negotiating contracts is not evidence of fixed-term employment. |
| `CF8_insurance_underwriting` | Insurance Underwriting | Insurance Technical | Insurance Underwriting. Assesses insured risks and decides policy acceptance, coverage, terms or premiums. Not credit lending decisions or actuarial model methodology. |
| `CF9_insurance_claims` | Insurance Claims | Insurance Technical | Insurance Claims. Assesses claims, coverage, loss evidence, settlement or claims disputes. Not insurance sales or underwriting new policies. |
| `other_profession` | Other Clear Profession |  | Other Clear Profession. A clear recurring profession outside the listed taxonomy. Do not force non-financial vacancies into banking categories. |
| `insufficient_evidence` | Occupational Mandate Unclear |  | Occupational Mandate Unclear. No defensible dominant profession from role-specific duties, including genuinely unresolved mixed mandates. |
| `not_applicable` | Not Applicable |  | Not Applicable. Only non-job content; not a substitute for missing evidence in a real vacancy. |

## Primary Activity

Choose the dominant recurring work product, not title or an incidental tool. Separate client coverage, sales and solution advice; research and investment decisions; credit approval and risk oversight; compliance monitoring, policy/legal advice and independent audit. Separate banking transaction processing and client-fund operations; pipelines, dashboards, model development and independent model validation. Product managers own lifecycle decisions; analysts own requirements; project managers own delivery. Use the JD’s output even when it is unusual for the occupation. Do not infer activity from archetype. Identify the accountable recurring deliverable and its object, not a paraphrase of the profession. Work responsibility (own/approve/advise/execute/coordinate/assure) is assessed independently within this dimension. If there is no defensible dominant output, use not_determinable.

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
| `credit_documentation_and_facility_support` | Credit Documentation & Facility Support | Prepares and follows up facility/security documents, loan drawdowns, conditions precedent and credit administration for approved lending. Not assessing/approving borrower risk, originating clients or actually executing payments as the dominant output. |
| `case_investigation_and_findings` | Case Investigation & Findings | Conducts fact-finding, interviews, evidence review and case findings on misconduct, fraud or allegations. Distinguish recurring investigations from routine monitoring or writing status reports. Client AML monitoring can remain compliance_monitoring_and_investigation when monitoring is dominant. |
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
| `not_determinable` | Dominant Output Unclear | The JD cannot support a defensible dominant recurring output. Do not substitute an archetype’s usual activity. |

## Business Line

Classify the business that this role directly serves, independently of its profession. Identify the role’s directly assigned commercial business, independently of profession, activity and employer brand. Product/service business first when directly assigned; use client-segment banking only when that is the actual coverage mandate. This priority does not move an asset-manager’s internal operations into an external service provider business: Transaction banking, securities services, markets, investment banking and asset management must be separated by outputs. Separate an external fund administrator’s client service (securities_services) from operations inside an explicitly assigned investment/asset-management business (asset_management). NAV calculation is an activity, not sufficient by itself to identify the business. A software engineer for a named markets desk is global_markets. Credit portfolio data does not by itself establish corporate versus retail banking. An explicit role title or assigned team naming a business/product/client mandate is valid direct evidence; the English business-line name need not appear in duties. Distinguish this from a generic grade, profession or ambiguous department. Do not infer from employer brand, marketing, industry of counterparties or a list of stakeholders. Own-institution corporate/shared-control duties => enterprise_wide, including local employee investigations/internal audit; generic internal IT without stated mandate => not_stated. Preserve the narrowest defensible business: a directly assigned combined Corporate & Institutional Banking division may remain corporate_institutional_coverage when its product/client subline is unspecified. It is not multi_line merely because the division name spans two client types. Explicit Business/Division/Department metadata is eligible assignment evidence; employer legal entity, brand and generic Job Family are not. Multi-line requires material responsibility for multiple lines, not occasional collaboration.

| Code | Label | Criterion |
|---|---|---|
| `personal_retail` | Personal / Retail Banking | Everyday consumer banking, deposits, cards or mortgages for individuals. |
| `wealth_and_affluent_banking` | Wealth & Affluent Banking | Role-specific acquisition, coverage or service of wealth, premier, affluent or HNW clients, including 丰盛理财、卓越理财、财富管理客户. Explicit wealth solutions for those clients qualify; the exact English business-line name is not required. Wealth alone does not establish private banking. |
| `private_banking` | Private Banking | Explicit private-banking team/mandate or UHNW bespoke private-bank service. Family office or wealthy clients alone do not prove private banking. |
| `commercial_sme` | Commercial / SME Banking | Small, owner-managed, SME or mid-market business clients. |
| `corporate_banking` | Corporate Banking | Corporate coverage/lending for large companies or multinational corporates. Not the financial industry of an incidental counterparty. |
| `corporate_institutional_coverage` | Corporate & Institutional Banking | An explicitly assigned combined corporate/institutional banking division or coverage team, when the JD does not establish a narrower product line or client segment. A useful supported parent, not a guess between corporate and institutional clients. Do not use for generic employer marketing or simply mentioning both as stakeholders. |
| `institutional_banking` | Institutional Banking | Coverage/banking for financial institutions or public-sector institutions: banks, insurers, asset managers, sovereigns. Product lines take precedence when explicit. |
| `transaction_banking` | Transaction Banking | Payments, cash management, trade finance, working capital or client treasury services as the dominant product line, regardless of client size. Not own-bank Treasury/ALM. |
| `securities_services` | Securities Services | Custody, clearing, settlement or outsourced fund administration/accounting supplied to clients as a securities/asset-servicing business. Internal accounting/operations of an explicitly assigned asset-management business remain asset_management; fund accounting alone does not prove the employer business. |
| `global_markets` | Global Markets | Traded-product sales, trading, structuring, markets research or directly supporting a named markets desk/business. |
| `investment_banking` | Investment Banking | M&A, ECM, DCM, leveraged finance or corporate-finance deal advisory/origination. |
| `asset_management` | Asset Management | Investment portfolios/funds/mandates as the explicitly employing or supported business. Not a fund administrator merely serving asset managers. |
| `insurance` | Insurance | Insurance underwriting, broking, claims or explicitly supported insurance operations. |
| `enterprise_wide` | Corporate & Shared Functions | Own-institution corporate/shared-control mandate: the bank’s own finance, treasury, HR, internal audit, employee misconduct investigations or group compliance controls. A country/regional remit still qualifies when the object is the institution itself. Generic internal technology or client-facing credit risk without a stated mandate is insufficient. |
| `multi_line` | Multiple Business Lines | At least two distinct, explicit and material served lines with no dominant one. Lists of collaborators or company marketing do not qualify. |
| `other_business_line` | Other Explicit Business | A clearly stated non-listed business, such as industrial/manufacturing or professional-services work. Do not force it into a banking line. |
| `not_stated` | Business Assignment Unclear | The JD does not establish the directly served line. Use only when role-specific client segment and product/service mandate remain unclear. Do not abstain merely because the English business-line name is absent; employer brand or incidental stakeholders alone are insufficient. |
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
| `not_stated` | Authority Unclear | Insufficient or conflicting evidence of the role’s actual leadership mandate; distinguish unknown from a supported IC role. |
| `not_applicable` | Not Applicable | Non-job content only. |

## Role Risk

| Code | Label | Severity | Threshold | Evidence rule | Useful follow-up |
|---|---|---|---|---|---|
| `title_function_mismatch` | Title–Duties Mismatch | medium | 0.85 | A substantial mismatch between the title’s occupational promise and dominant actual duties. Grade inflation alone, a broad title or legitimate adjacent duties are not a mismatch. | Clarify the actual mandate behind the title. |
| `overloaded_scope` | Scope & Priorities Need Clarification | medium | 0.85 | Several materially separate mandates are simultaneously assigned without clear priority, ownership or resourcing. Routine cross-functional collaboration, end-to-end work and senior breadth are not enough; a JD cannot prove workload is unrealistic. | Clarify priorities, ownership and resourcing across the stated mandates. |
| `pooled_or_multi_role_posting` | Pooled or Multiple Distinct Roles | medium | 0.8 | Explicit pipeline/evergreen or materially different roles; not a graduate programme, multiple seats, or alternative locations for the same role. | Confirm the specific open vacancy and its responsibilities. |
| `non_permanent_or_outsourced` | Fixed-term / Contingent Employment | medium | 0.85 | This advertised job itself has fixed-term, temporary, contractor, agency/payroll or secondment terms. Contract drafting, vendor/outsourcing oversight, ordinary employment contracts and past contractor experience are not evidence. Explicit permanent employment or negation rules this out. | Confirm duration, employing entity and renewal/conversion terms. |
| `thin_or_template_jd` | Limited Role-specific Evidence | low | 0.9 | Responsibilities are too sparse, vague or template-dominated to establish the actual mandate. Specific short descriptions can be sufficient; benefits/EEO boilerplate alongside clear duties is not itself a risk. | Request concrete responsibilities and expected outputs. |

## Five distinct questions

| Dimension | Information boundary |
|---|---|
| roleArchetype | Professional track and durable accountable mandate; neither title grade nor business segment defines the occupation. |
| primaryActivity | Dominant recurring deliverable plus task responsibility: own, decide, advise, execute, coordinate or independently assure. Never default from profession. |
| businessLine | Narrowest supported served business plus independently evidenced beneficiary segment. Retain a supported parent assignment when finer detail is absent. |
| leadershipLevel | Current authority over delivery and people. Grade, geography and past experience do not establish reports; distinguish hands-on work from proof of no reports. |
| roleRisk | Only source-backed material conditions affecting acceptance of this job: contingent employment, concrete operating constraints or structural mandate concerns. Exclude ordinary professional duties, generic information gaps and unsupported severity claims. Abstain rather than fill space. |

## Primary Activity: task responsibility

| Code | Label | Evidence standard |
|---|---|---|
| `own_outcome` | Outcome Ownership | Owns an explicit recurring business/product/process outcome or KPI with discretion and accountability. The word own/lead in generic boilerplate is insufficient. |
| `approve_decide` | Approval & Decision Authority | Makes or signs off the substantive credit, investment, policy, design or acceptance decision. Preparing analysis for another decision maker is advice, not approval. |
| `advise_recommend` | Advice & Recommendations | Produces judgement, advice, analysis or recommendations used by another accountable decision maker; not implied by Analyst title. |
| `execute_deliver` | Execution & Delivery | Personally builds, processes, investigates or delivers specified outputs under an established remit. This concerns task responsibility, not whether the employee manages staff. |
| `coordinate_enable` | Coordination & Enablement | Primarily coordinates inputs, documentation, dependencies or support so another owner can deliver; not every role with stakeholders. |
| `independent_assurance` | Independent Challenge & Assurance | Independently challenges or validates others’ decisions, models or controls; routine self-checking is not independent assurance. |
| `not_established` | Responsibility Boundary Unclear | The dominant responsibility boundary is not supported by actual recurring duties. Do not infer from profession or leadership level. |

## Business Line: beneficiary segment

| Code | Label | Evidence standard |
|---|---|---|
| `individual_consumers` | Individual / Retail Clients | Explicit everyday consumer/retail customers; not employer brand or a mortgage product without customer assignment. |
| `affluent_hnw` | Affluent / HNW Clients | Explicit premier/affluent/HNW customers, including 丰盛理财/卓越理财; wealth alone does not establish UHNW/private banking. |
| `uhnw_private` | UHNW / Private-bank Clients | Explicit UHNW or private-bank client book. A wealthy counterparty or family-office collaborator is insufficient. |
| `sme_midmarket` | SME / Mid-market Clients | Explicit SME, owner-managed, small business or mid-market client portfolio. |
| `corporate_multinational` | Corporate / Multinational Clients | Explicit corporate/large company/multinational client coverage. Do not infer merely from lending or CIB division. |
| `financial_public_institutions` | Financial / Public Institutions | Explicit financial institutions, banks, insurers, asset managers, sovereign/public-sector institutional client coverage. |
| `explicit_mixed_clients` | Explicit Mixed Client Segments | At least two explicitly served client segments with material duties for each; a division name or collaborator list is insufficient. |
| `own_institution` | Own Institution / Employees | The actual beneficiary is the employing institution, its own finances/controls or employees, not external clients. |
| `not_established` | Client Segment Unclear | No specific client/beneficiary segment is established. Preserve a known business/product line independently. |

## Role Risk: employment terms

| Code | Label | Evidence standard |
|---|---|---|
| `permanent` | Explicit Permanent Employment | The advertised position itself is explicitly permanent or indefinite; never inferred from absence of contract terms. |
| `fixed_term` | Fixed-term Employment | The advertised position itself has a fixed end date, duration or fixed-term employment clause. |
| `temporary_agency` | Temporary / Agency Employment | The advertised worker is explicitly temporary or employed/payrolled through an agency; managing agencies is not evidence. |
| `contractor` | Contractor Engagement | The advertised worker is engaged as a contractor/consultant under contingent terms; advising on client contracts is not evidence. |
| `secondment` | Secondment | The advertised worker itself is on an explicitly stated secondment arrangement. |
| `not_disclosed` | Employment Terms Unspecified | The posting does not explicitly establish employment terms. Neither a normal vacancy nor a job title proves permanent employment. |

## Role Risk: operating obligations

| Code | Label | Evidence standard |
|---|---|---|
| `revenue_targets` | Revenue / Acquisition Targets | Explicit personal/book revenue, acquisition, sales or commercial KPI accountability. Generic business growth or supporting sales is insufficient; do not infer workload or compensation. |
| `on_call_shift` | Shift / On-call Obligations | Explicit shifts, on-call rota, nights/weekends or out-of-hours response expected of this worker. General production support alone is insufficient. |
| `travel_mobility` | Travel / Location Obligations | Explicit regular travel, relocation or multi-site presence expected of this worker. Client geography and a global employer alone are insufficient. |
| `approval_accountability` | Personal Regulatory / Statutory Accountability | Explicit personal regulatory accountability, named registered/accountable status or statutory sign-off responsibility. Routine transaction/credit approval, normal control checking and generic compliance duties do not qualify. |
| `time_critical_delivery` | Market / Statutory Cut-off Obligations | Explicit externally imposed market, settlement or statutory filing cut-offs borne by this worker. Generic SLA, service quality, normal deadlines and incident response alone do not qualify. |
| `none_explicit` | No Explicit Condition Identified | No such material condition is explicitly evidenced. This is an extraction result, never a claim that the role is low-risk or has no obligations. |

## Runtime safeguards

- Employment/operating descriptors require >= 0.8; activity/client descriptors require >= 0.6, a non-conflicting result and an actual selected source passage. No profession-to-activity, business-to-client or silence-to-permanent default.
- Sparse data never automatically creates a template warning: >= 0.9 model support and an actual cited passage are required. Displayed severity ratings are omitted because the JD does not establish real severity.
- Up to two distinct, source-backed operating obligations are retained. They describe conditions, not predictions of workload, employer quality or legal conclusions. Duplicates are removed.
- Structured Business/Division/Department/Team assignment metadata can be cited for business context, but cannot become profession, activity, leadership, employment or risk evidence. Employer legal entity and Job Family do not establish a served business.
- When no commercial line is supported, a verbatim assigned organisational unit (such as CTO Data Technology) remains visible as partial context without inventing enterprise-wide or client-business classification.
- An own-institution beneficiary descriptor additionally requires an explicit internal/employee/institutional-object anchor; technical pipelines alone are insufficient.
- Disclosed employment duration is retained from its source passage. Duplicate contingent-employment warnings are folded into the fact and a focused renewal/employer question, rather than asking for a duration already supplied.
- A standalone combined CIB heading or explicit assigned division can retain the supported parent business when the finer client/product line is unknown. Generic employer marketing and multiple conflicting assignments do not resolve it.
- Employment and operating descriptors additionally require a compatible lexical anchor in the selected passage; a citation ID alone cannot manufacture a shift, travel duty, approval or employment term. These cues are necessary checks, never sufficient proof.
- Role Risk excludes routine accuracy/reliability duties, generic SLA and default questions about missing business, leadership or employment information. Permanent employment and normal posting shape are not risk findings. An empty dash is not a no-risk guarantee.
- The frontend presents hands-on contribution as a supported mandate, not proof that there are no direct reports.
- Provider probabilities are not calibrated accuracy estimates; the five-dimension card omits percentages that could be mistaken for measured precision.
- Each classification has a short label and, when supported, a source passage selected from the actual JD. Evidence selections use existing Choice primitives, not generated explanations. Source selection is itself a model judgement, not proof that a label is correct.
- Business-line assignment requires explicit-context support >= 0.8 and a non-conflicting classification >= 0.5. Multi-line also requires independent support for multiple materially served lines; KYC/credit/portfolio objects do not establish multiple lines.
- Evidence-selection confidence measures which passage to cite; it does not replace independent classification confidence. Several valid source passages can split the selection probabilities. Only a valid selected source ID with a finite positive confidence is used.
- Missing/invalid answers and probabilities stay unknown; neither a missing answer nor a 0.5 noul is affirmative evidence.
- No archetype-to-activity default. Weak activity answers below 0.35 abstain; other low-confidence/close alternatives remain visibly uncertain.
- Explicit source resolution can retain a single literal business mandate in a role title or a corroborated own-institution corporate/control mandate when model output is unknown. Multiple named mandates remain ambiguous; resolved answers carry basis=explicit_source and no invented model confidence.
- Leadership claims require a selected source passage plus explicit evidence nouls at least 0.8. Manager-of-managers also requires people-management support. Downgrades clear the rejected confidence.
- No automatic IC inference from missing management answers. A real but underspecified vacancy uses Not Stated, not Not Applicable.
- Employment and pooled-vacancy flags require both a supported judgement and a selected source passage. Keywords never promote risk to 100%.
- Unknown risk assessment is distinct from no supported structural flags. Flags are questions to clarify, not conclusions about employer quality, actual workload or legal status.
- Non-job content neutralises all dimensions and removes their evidence/candidates. Insufficient overall detail suppresses unsupported profession/activity/leadership guesses. A dimension may retain an independently classified result >= 0.75 with an actual duty citation; staff authority still requires the separate management gates. A directly evidenced business line can remain.
- Thresholds are conservative engineering gates, not measured accuracy guarantees. Model quality must be evaluated separately on labelled real JDs.
- v5.1.0 uses a new frontend cache namespace. Retired broad role codes are rejected instead of silently assigned a narrower meaning. Raw jobs, lifecycle values and scraping are unchanged.
