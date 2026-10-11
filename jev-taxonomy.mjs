// One source of truth for provider criteria, display labels and generated docs.
export const TAXONOMY_VERSION = 'jev-taxonomy-v5.0.1';
export const ROLE_FAMILIES = { CS:'Client & Commercial', IR:'Investment, Markets & Research', RC:'Risk, Compliance, Audit & Investigations', OP:'Operations & Securities Services', PS:'Product, Change, Strategy & Design', TE:'Technology & Engineering', CF:'Corporate Functions', IN:'Insurance Technical' };

// Each entry names an occupational mandate, its output and its nearest exclusion.
const roles = {
  CS1_relationship_management:['Relationship Management & Coverage','Owns an ongoing client book, retention, wallet share and coverage plan. Some acquisition is normal; use direct sales when new-client conversion dominates.'],
  CS2_acquisition_direct_sales:['Acquisition & Direct Sales','Owns prospecting, acquisition funnels, sales targets and conversion. Not service requests, existing-book coverage or marketing campaign design.'],
  CS3_product_specialist_advisory:['Product Specialist & Advisory','Provides specialist client/product advice, proposals and solution structuring alongside coverage teams. Not product roadmap ownership, legal advice or investment-banking deal execution.'],
  CS4_customer_service_frontline:['Customer Service & Frontline','Resolves customer enquiries and service requests through branches or contact centres. Not a sales quota role or back-office processing.'],
  CS5_investment_banking_advisory:['Investment Banking & Financing Origination','Originates and executes M&A, ECM, DCM or corporate-finance mandates, valuations and transaction advice. Not ordinary corporate lending coverage or trading.'],
  CS6_markets_sales:['Markets Sales','Distributes traded products, covers investors and originates client flow or solutions. Not taking trading-book risk, market-making or post-trade settlement.'],
  IR1_investment_research:['Investment Research & Strategy','Produces security, issuer or macro investment views and recommendations. Not credit approval, routine BI reporting or portfolio investment decisions.'],
  IR2_portfolio_management:['Portfolio Management','Owns investment selection, allocation, portfolio construction and performance for managed assets. Not fund accounting or sales of investment products.'],
  IR3_quantitative_research:['Quantitative Research & Modelling','Builds pricing, trading, investment, capital or financial-risk models and libraries. Not general-purpose ML, data pipelines or independent validation of others’ models.'],
  IR4_trading:['Trading & Market Making','Owns pricing, execution, hedging, market-making or trading-book risk. Not markets sales, investment research or settlement operations.'],
  RC1_credit_risk:['Credit Risk & Underwriting','Owns borrower credit analysis, approval, limits, monitoring or restructuring of lending exposure. Not insurance underwriting or investment credit research.'],
  RC2_financial_crime:['Financial Crime, KYC & AML','Owns due diligence, sanctions, AML monitoring or financial-crime investigations. Routine account setup without substantive due diligence is client onboarding.'],
  RC3_compliance:['Compliance & Regulatory Advisory','Owns conduct, regulatory compliance policy, monitoring or advice. Not legal counsel, financial-crime specialism or independent internal audit.'],
  RC4_enterprise_risk:['Enterprise, Operational & Business Risk','Owns risk appetite, exposure oversight, first/second-line controls or risk frameworks. Not universal employee conduct obligations, credit underwriting or independent audit.'],
  RC5_internal_audit:['Internal Audit','Provides independent audit assurance, findings and remediation assessment. Not first-line control execution or routine compliance monitoring.'],
  RC6_model_validation:['Independent Model Validation','Independently challenges model assumptions, methodology, implementation and limitations, producing validation findings. Not developing or maintaining the same models.'],
  RC7_corporate_investigations:['Corporate & Employee Investigations','Owns investigations into employee misconduct, internal fraud, allegations or wrongdoing affecting the institution, with case findings and fact-finding accountability. Not client AML/KYC/sanctions investigations, independent internal audit or general risk-framework oversight.'],
  OP1_banking_operations:['Banking Operations','Processes and controls payments, loans, deposits, trade-finance or cash transactions. Not selling these products or defining product strategy.'],
  OP2_securities_fund_services:['Securities & Fund Operations','Produces custody, settlement, NAV, fund accounting, transfer agency or asset-servicing outputs. Not the bank’s own corporate accounts or investment decisions.'],
  OP3_client_onboarding:['Client Onboarding & Implementation','Owns client setup, account opening, documentation or implementation of an agreed service. Not AML investigation or new-client sales; use those when they dominate.'],
  PS1_product_management:['Product Management','Owns proposition, roadmap, lifecycle, prioritisation and product outcomes. Not a product sales specialist or delivery coordinator without product decisions.'],
  PS2_business_analysis_change:['Business Analysis & Requirements','Owns business requirements, process mapping, user stories and acceptance criteria. Not programme budget/milestones or product-roadmap decisions.'],
  PS3_strategy_business_management:['Strategy & Business Management','Owns strategy, business planning, operating performance or COO/business-manager coordination. Not project delivery, accounting or hands-on BI as the dominant profession.'],
  PS4_experience_design_research:['Experience Design & Research','Owns user research, UX/UI, journeys and service design. Not general marketing or software implementation.'],
  PS5_project_programme_change:['Project, Programme & Change Management','Owns delivery milestones, dependencies, budget, implementation or change adoption. Not requirements alone; use technology delivery for an explicitly technology-led mandate.'],
  TE1_software_engineering:['Software Engineering','Builds, tests and maintains application code/services. Not infrastructure operations, standalone model research or cross-system architecture authority.'],
  TE2_platform_infrastructure_sre:['Platform, Infrastructure & SRE','Builds/operates cloud, infrastructure, networks or production reliability. Not application feature development or cybersecurity as the primary mandate.'],
  TE3_architecture:['Technology Architecture','Owns cross-system architecture, technical standards and design authority. Not merely contributing design as a software developer.'],
  TE4_cyber_security:['Cybersecurity','Owns security engineering, cyber defence, identity, threats or security architecture. Not general operational risk or employee security awareness.'],
  TE5_data_engineering:['Data Engineering','Owns pipelines, datasets, warehouses, data platforms, lineage and reliability. AI/vector data preparation remains data engineering unless model development dominates.'],
  TE6_data_science_ml:['Data Science & Machine Learning','Develops statistical/ML models, experiments, predictive systems or AI model evaluation. Financial pricing/trading/risk models belong to quantitative research; dashboards to BI.'],
  TE7_technology_management_delivery:['Technology Management & Delivery','Owns technology delivery, service/engineering management, technical programmes or IT operating outcomes. Management level is judged separately; Head/VP alone is not evidence.'],
  TE8_data_analytics_bi:['Data Analytics & Business Intelligence','Owns SQL analysis, dashboards, metrics, BI or descriptive decision support. Not pipelines, predictive models or business strategy without substantive analytical outputs.'],
  CF1_finance_accounting:['Finance, Accounting & FP&A','Owns the employer’s accounting, financial control, reporting, budgeting or forecasting. Client-fund NAV/accounting belongs to fund operations.'],
  CF2_treasury_alm:['Treasury & ALM','Owns the institution’s funding, liquidity, capital and balance-sheet decisions. Not selling cash-management products or coding liquidity models.'],
  CF3_hr_people:['HR & People Services','Owns HR, recruitment, reward, talent, learning or organisation services. Hiring one’s own team does not make a manager an HR professional.'],
  CF4_marketing_communications:['Marketing & Communications','Owns brand, campaigns, communications, content or marketing effectiveness. Not direct sales conversion or predominantly analytical BI outputs.'],
  CF5_corporate_services:['Administration & Corporate Services','Owns procurement, vendor administration, workplace, executive support or corporate services. Managing vendor contracts does not imply outsourced employment.'],
  CF6_actuarial:['Actuarial & Insurance Pricing','Owns actuarial valuation, reserving, pricing methodology, solvency or insurance capital models. Not individual-policy underwriting or claims handling.'],
  CF7_legal_counsel:['Legal Counsel','Owns legal advice, contracts, litigation or legal risk. Not compliance monitoring; negotiating contracts is not evidence of fixed-term employment.'],
  CF8_insurance_underwriting:['Insurance Underwriting','Assesses insured risks and decides policy acceptance, coverage, terms or premiums. Not credit lending decisions or actuarial model methodology.'],
  CF9_insurance_claims:['Insurance Claims','Assesses claims, coverage, loss evidence, settlement or claims disputes. Not insurance sales or underwriting new policies.'],
  other_profession:['Other Clear Profession','A clear recurring profession outside the listed taxonomy. Do not force non-financial vacancies into banking categories.'],
  insufficient_evidence:['Occupational Mandate Unclear','No defensible dominant profession from role-specific duties, including genuinely unresolved mixed mandates.'],
  not_applicable:['Not Applicable','Only non-job content; not a substitute for missing evidence in a real vacancy.']
};
export const ROLE_ARCHETYPE_LABELS = Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v[0]]));
export const ROLE_ARCHETYPES = Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,`${v[0]}. ${v[1]}`]));
export const ROLE_FAMILY = Object.fromEntries(Object.keys(roles).map(k=>[k,['CF6_actuarial','CF8_insurance_underwriting','CF9_insurance_claims'].includes(k)?'IN':k.match(/^(CS|IR|RC|OP|PS|TE|CF)/)?.[1]||null]));
export const ROLE_GUIDANCE = 'Classify the durable occupational mandate from recurring responsibilities and accountable outputs. Title, qualifications, tools and employer marketing cannot override the work. Distinguish adjacent categories using their exclusions. Generic conduct/compliance/leadership boilerplate does not define a profession. Mixed duties are normal: choose the dominant mandate only when supported; otherwise insufficient_evidence. Classify each dimension independently. This dimension identifies the durable professional track: which capability and accountable mandate would persist if the employer or business line changed? Do not simply copy the dominant task, grade or served market.';

const activities = {
  client_relationship_management:['Client Portfolio Coverage','Owns retention, service and wallet share of an existing client portfolio; not new-client conversion.'],
  sales_and_business_development:['New Business Origination','Prospects for and converts new clients, sales, mandates or distribution opportunities; not routine servicing.'],
  advisory_and_solution_structuring:['Advisory & Solution Structuring','Designs or advises on specific client financing, investment or product solutions; not roadmap ownership.'],
  trading_and_execution:['Pricing, Trading & Execution','Quotes, prices, executes, hedges or market-makes traded instruments; not post-trade processing.'],
  frontline_customer_service:['Customer Service','Resolves customer requests through frontline service channels; not owning sales targets.'],
  investment_research_and_recommendations:['Investment Research & Recommendations','Produces investment, issuer, equity, credit or macro views and recommendations; not lending approval.'],
  portfolio_and_investment_management:['Investment & Portfolio Decisions','Makes investment-selection, allocation or portfolio-construction decisions for managed assets.'],
  credit_underwriting_and_approval:['Credit Assessment & Approval','Underwrites, approves, monitors or restructures lending exposures; not insurance policies.'],
  risk_management_and_quantification:['Risk Measurement & Oversight','Measures exposures, sets limits/appetite or owns risk frameworks and controls; not independent model validation.'],
  compliance_monitoring_and_investigation:['Compliance Monitoring & Investigation','Performs substantive AML/KYC, sanctions, surveillance, conduct monitoring or investigations.'],
  audit_and_control_testing:['Independent Audit & Assurance','Independently tests controls and produces audit findings; not routine self-checking of one’s own work.'],
  regulatory_legal_and_policy_advisory:['Regulatory, Legal & Policy Advice','Interprets law/regulation, drafts legal advice/contracts or owns policy; not monitoring transactions.'],
  credit_documentation_and_facility_support:['Credit Documentation & Facility Support','Prepares and follows up facility/security documents, loan drawdowns, conditions precedent and credit administration for approved lending. Not assessing/approving borrower risk, originating clients or actually executing payments as the dominant output.'],
  case_investigation_and_findings:['Case Investigation & Findings','Conducts fact-finding, interviews, evidence review and case findings on misconduct, fraud or allegations. Distinguish recurring investigations from routine monitoring or writing status reports. Client AML monitoring can remain compliance_monitoring_and_investigation when monitoring is dominant.'],
  banking_transaction_operations:['Banking Transaction Processing','Processes and controls payments, loans, deposits, cash or trade-finance transactions.'],
  securities_and_fund_operations:['Fund & Securities Operations','Produces NAV/fund accounts, settlement, custody, transfer-agency or asset-servicing outputs.'],
  client_onboarding_and_implementation:['Client Onboarding & Implementation','Implements client services, account setup and documentation; not substantive AML investigation or acquisition.'],
  finance_accounting_and_control:['Accounting, Reporting & Control','Produces corporate accounts, financial control or statutory/regulatory financial reporting; not client-fund NAV.'],
  financial_planning_and_analysis:['Budgeting, Forecasting & FP&A','Produces budgets, forecasts, variance analysis or financial performance decisions; not bookkeeping.'],
  treasury_and_alm_management:['Funding, Liquidity & ALM','Manages own-institution funding, liquidity, capital and balance sheet; not client cash-product sales.'],
  insurance_actuarial_and_pricing:['Actuarial Valuation & Pricing','Develops actuarial pricing, reserving, valuation or solvency calculations; not individual policy decisions.'],
  insurance_underwriting:['Insurance Risk Acceptance','Decides insurance policy acceptance, coverage, terms and premiums.'],
  insurance_claims_assessment:['Claims Assessment & Settlement','Evaluates claims evidence, policy coverage, losses and settlement.'],
  people_and_organisation_services:['People & Organisation Services','Delivers HR, recruitment, talent, reward, learning or organisational services.'],
  marketing_and_communications:['Campaigns & Communications','Delivers marketing campaigns, brand, communications, content or public relations.'],
  administration_and_business_support:['Administration & Corporate Support','Delivers procurement, workplace, vendor administration or corporate support.'],
  product_management_and_roadmap:['Product Strategy & Roadmap','Owns product proposition, roadmap, lifecycle, prioritisation and product outcomes.'],
  business_analysis_and_requirements:['Requirements & Process Analysis','Defines requirements, processes, operating models, user stories and acceptance criteria.'],
  project_change_and_delivery:['Project Delivery & Change','Owns implementation, milestones, dependencies, programme/change delivery and adoption.'],
  strategy_and_business_management:['Strategy & Business Planning','Drives strategy, planning, business performance and executive decision support.'],
  experience_design_and_user_research:['Experience Design & User Research','Produces UX/UI, journeys, service design or user research.'],
  software_engineering:['Software Development & Testing','Builds, tests, deploys and maintains application software/services.'],
  platform_infrastructure_and_sre:['Platform Engineering & Reliability','Builds or operates cloud, infrastructure, networks, DevOps/SRE or production platforms.'],
  architecture_and_technical_design:['Architecture & Technical Design','Owns cross-system design, technical standards or architecture authority.'],
  cybersecurity_operations:['Security Engineering & Defence','Delivers cyber defence, security engineering, threat detection, identity or SOC operations.'],
  data_engineering:['Data Pipelines & Platforms','Builds pipelines, warehouses, datasets, lineage, quality and data infrastructure.'],
  data_analytics_and_bi:['Analytics, Metrics & BI','Produces dashboards, descriptive analysis, metrics and decision-support reporting.'],
  data_science_quant_and_modelling:['Statistical, ML & Quantitative Modelling','Builds predictive, statistical, ML, pricing, investment or financial-risk models. Financial/nonfinancial domain is distinguished by Role Archetype.'],
  independent_model_validation:['Independent Model Validation','Independently challenges others’ model assumptions, methodology, implementation and performance. Not model development.'],
  not_determinable:['Dominant Output Unclear','The JD cannot support a defensible dominant recurring output. Do not substitute an archetype’s usual activity.']
};
export const ACTIVITY_LABELS = Object.fromEntries(Object.entries(activities).map(([k,v])=>[k,v[0]]));
export const ACTIVITIES = Object.fromEntries(Object.entries(activities).map(([k,v])=>[k,v[1]]));
export const ACTIVITY_CRITERIA = ACTIVITIES;
export const ACTIVITY_GUIDANCE = 'Choose the dominant recurring work product, not title or an incidental tool. Separate client coverage, sales and solution advice; research and investment decisions; credit approval and risk oversight; compliance monitoring, policy/legal advice and independent audit. Separate banking transaction processing and client-fund operations; pipelines, dashboards, model development and independent model validation. Product managers own lifecycle decisions; analysts own requirements; project managers own delivery. Use the JD’s output even when it is unusual for the occupation. Do not infer activity from archetype. Identify the accountable recurring deliverable and its object, not a paraphrase of the profession. Work responsibility (own/approve/advise/execute/coordinate/assure) is assessed independently within this dimension. If there is no defensible dominant output, use not_determinable.';

const business = {
  personal_retail:['Personal / Retail Banking','Everyday consumer banking, deposits, cards or mortgages for individuals.'],
  wealth_and_affluent_banking:['Wealth & Affluent Banking','Role-specific acquisition, coverage or service of wealth, premier, affluent or HNW clients, including 丰盛理财、卓越理财、财富管理客户. Explicit wealth solutions for those clients qualify; the exact English business-line name is not required. Wealth alone does not establish private banking.'],
  private_banking:['Private Banking','Explicit private-banking team/mandate or UHNW bespoke private-bank service. Family office or wealthy clients alone do not prove private banking.'],
  commercial_sme:['Commercial / SME Banking','Small, owner-managed, SME or mid-market business clients.'],
  corporate_banking:['Corporate Banking','Corporate coverage/lending for large companies or multinational corporates. Not the financial industry of an incidental counterparty.'],
  corporate_institutional_coverage:['Corporate & Institutional Banking','An explicitly assigned combined corporate/institutional banking division or coverage team, when the JD does not establish a narrower product line or client segment. A useful supported parent, not a guess between corporate and institutional clients. Do not use for generic employer marketing or simply mentioning both as stakeholders.'],
  institutional_banking:['Institutional Banking','Coverage/banking for financial institutions or public-sector institutions: banks, insurers, asset managers, sovereigns. Product lines take precedence when explicit.'],
  transaction_banking:['Transaction Banking','Payments, cash management, trade finance, working capital or client treasury services as the dominant product line, regardless of client size. Not own-bank Treasury/ALM.'],
  securities_services:['Securities Services','Custody, clearing, settlement or outsourced fund administration/accounting supplied to clients as a securities/asset-servicing business. Internal accounting/operations of an explicitly assigned asset-management business remain asset_management; fund accounting alone does not prove the employer business.'],
  global_markets:['Global Markets','Traded-product sales, trading, structuring, markets research or directly supporting a named markets desk/business.'],
  investment_banking:['Investment Banking','M&A, ECM, DCM, leveraged finance or corporate-finance deal advisory/origination.'],
  asset_management:['Asset Management','Investment portfolios/funds/mandates as the explicitly employing or supported business. Not a fund administrator merely serving asset managers.'],
  insurance:['Insurance','Insurance underwriting, broking, claims or explicitly supported insurance operations.'],
  enterprise_wide:['Corporate & Shared Functions','Own-institution corporate/shared-control mandate: the bank’s own finance, treasury, HR, internal audit, employee misconduct investigations or group compliance controls. A country/regional remit still qualifies when the object is the institution itself. Generic internal technology or client-facing credit risk without a stated mandate is insufficient.'],
  multi_line:['Multiple Business Lines','At least two distinct, explicit and material served lines with no dominant one. Lists of collaborators or company marketing do not qualify.'],
  other_business_line:['Other Explicit Business','A clearly stated non-listed business, such as industrial/manufacturing or professional-services work. Do not force it into a banking line.'],
  not_stated:['Business Assignment Unclear','The JD does not establish the directly served line. Use only when role-specific client segment and product/service mandate remain unclear. Do not abstain merely because the English business-line name is absent; employer brand or incidental stakeholders alone are insufficient.'],
  not_applicable:['Not Applicable','Only non-job content.']
};
export const BUSINESS_LINES = Object.fromEntries(Object.entries(business).map(([k,v])=>[k,v[0]]));
export const BUSINESS_LINE_CRITERIA = Object.fromEntries(Object.entries(business).map(([k,v])=>[k,v[1]]));
export const BUSINESS_LINE_GUIDANCE = 'Classify the business that this role directly serves, independently of its profession. Identify the role’s directly assigned commercial business, independently of profession, activity and employer brand. Product/service business first when directly assigned; use client-segment banking only when that is the actual coverage mandate. This priority does not move an asset-manager’s internal operations into an external service provider business: Transaction banking, securities services, markets, investment banking and asset management must be separated by outputs. Separate an external fund administrator’s client service (securities_services) from operations inside an explicitly assigned investment/asset-management business (asset_management). NAV calculation is an activity, not sufficient by itself to identify the business. A software engineer for a named markets desk is global_markets. Credit portfolio data does not by itself establish corporate versus retail banking. An explicit role title or assigned team naming a business/product/client mandate is valid direct evidence; the English business-line name need not appear in duties. Distinguish this from a generic grade, profession or ambiguous department. Do not infer from employer brand, marketing, industry of counterparties or a list of stakeholders. Own-institution corporate/shared-control duties => enterprise_wide, including local employee investigations/internal audit; generic internal IT without stated mandate => not_stated. Preserve the narrowest defensible business: a directly assigned combined Corporate & Institutional Banking division may remain corporate_institutional_coverage when its product/client subline is unspecified. It is not multi_line merely because the division name spans two client types. Explicit Business/Division/Department metadata is eligible assignment evidence; employer legal entity, brand and generic Job Family are not. Multi-line requires material responsibility for multiple lines, not occasional collaboration.';

export const LEADERSHIP_LABELS = {individual_contributor:'Individual Contributor',informal_mentor_or_lead:'Mentor / Informal Lead',team_lead:'Team / Workstream Lead',people_manager:'People Manager',manager_of_managers:'Manager of Managers',not_stated:'Authority Unclear',not_applicable:'Not Applicable'};
export const LEADERSHIP_LEVELS = {
  individual_contributor:'Substantive hands-on responsibilities establish an individual contributor mandate without stated team/people ownership. Do not use merely because a thin JD is silent about management.',
  informal_mentor_or_lead:'Explicit recurring mentoring, coaching or technical guidance without owning a team or workstream. Stakeholder influence alone is insufficient.',
  team_lead:'Explicit accountability for a team/squad/workstream’s work, priorities or delivery without formal line-management powers. Generic “lead initiatives” or conduct boilerplate is insufficient.',
  people_manager:'Explicit current direct reports or authority for their hiring, performance reviews, appraisal or career development. Managing projects, clients, vendors, budgets or recruitment as an HR task is not people management.',
  manager_of_managers:'Explicit line-management of managers/team leaders who themselves manage staff. Multiple projects, teams, geography, “Head”, “Director” or function ownership alone is insufficient.',
  not_stated:'Insufficient or conflicting evidence of the role’s actual leadership mandate; distinguish unknown from a supported IC role.',
  not_applicable:'Non-job content only.'
};
export const LEADERSHIP_GUIDANCE = 'Measure actual management accountability, not grade or seniority. VP/AVP/Director/Head can be an IC. Past leadership experience in requirements is not a current reporting structure. Generic bank conduct/People & Talent boilerplate is not role-specific management evidence. Distinguish people management from delivery leadership and mentoring; manager_of_managers requires explicit subordinate managers.';
export const POSTING_TYPES = {specific_role:'One clearly defined role; several seats or alternative locations for the same duties still qualify.',programme_intake:'Formal internship, graduate, trainee, apprentice or rotational cohort intake; not inherently a pooled-vacancy risk.',talent_pool_or_evergreen:'Explicit talent pool/pipeline/evergreen without a defined current vacancy.',multiple_distinct_roles:'Materially different professions or levels/duties combined in one advert; not several seats or locations for one role.',not_a_job_posting:'Event, test, placeholder or non-recruitment content.'};
export const RISK_FLAGS = {
  title_function_mismatch:{label:'Title–Duties Mismatch',severity:'medium',threshold:.85,question:'riskTitleFunctionMismatch',evidence:'riskTitleEvidence',rule:'A substantial mismatch between the title’s occupational promise and dominant actual duties. Grade inflation alone, a broad title or legitimate adjacent duties are not a mismatch.',action:'Clarify the actual mandate behind the title.'},
  overloaded_scope:{label:'Scope & Priorities Need Clarification',severity:'medium',threshold:.85,question:'riskOverloadedScope',evidence:'riskScopeEvidence',rule:'Several materially separate mandates are simultaneously assigned without clear priority, ownership or resourcing. Routine cross-functional collaboration, end-to-end work and senior breadth are not enough; a JD cannot prove workload is unrealistic.',action:'Clarify priorities, ownership and resourcing across the stated mandates.'},
  pooled_or_multi_role_posting:{label:'Pooled or Multiple Distinct Roles',severity:'medium',threshold:.8,evidence:'postingEvidence',rule:'Explicit pipeline/evergreen or materially different roles; not a graduate programme, multiple seats, or alternative locations for the same role.',action:'Confirm the specific open vacancy and its responsibilities.'},
  non_permanent_or_outsourced:{label:'Fixed-term / Contingent Employment',severity:'medium',threshold:.85,question:'riskNonPermanent',evidence:'riskEmploymentEvidence',rule:'This advertised job itself has fixed-term, temporary, contractor, agency/payroll or secondment terms. Contract drafting, vendor/outsourcing oversight, ordinary employment contracts and past contractor experience are not evidence. Explicit permanent employment or negation rules this out.',action:'Confirm duration, employing entity and renewal/conversion terms.'},
  thin_or_template_jd:{label:'Limited Role-specific Evidence',severity:'low',threshold:.85,question:'riskGenericTemplate',rule:'Responsibilities are too sparse, vague or template-dominated to establish the actual mandate. Specific short descriptions can be sufficient; benefits/EEO boilerplate alongside clear duties is not itself a risk.',action:'Request concrete responsibilities and expected outputs.'}
};

// Literal named business mandates only; occupations such as Fund Accountant are not business lines.
export const EXPLICIT_BUSINESS_TITLE_RULES={
    private_banking:/\bprivate bank(?:ing)?\b|私人银行|私行/i,
    wealth_and_affluent_banking:/\b(?:wealth management|affluent banking|premier banking|treasures)\b|丰盛理财|卓越理财|财富管理/i,
    commercial_sme:/\b(?:SME banking|commercial bank(?:ing)?|business banking)\b|中小企业银行/i,
    corporate_institutional_coverage:/\bcorporate\s*(?:and|&)\s*institutional bank(?:ing)?\b|企业及机构银行|公司及机构银行/i,
    corporate_banking:/\bcorporate bank(?:ing)?\b|公司银行/i,
    institutional_banking:/\binstitutional bank(?:ing)?\b|金融机构银行/i,
    transaction_banking:/\b(?:transaction bank(?:ing)?|cash management|trade finance|global payments solutions)\b|交易银行|贸易融资|现金管理/i,
    securities_services:/\b(?:securities services|fund administration|custody operations)\b|证券服务|基金行政/i,
    global_markets:/\b(?:global (?:financial )?markets|sales (?:&|and) trading)\b|环球金融市场|全球金融市场/i,
    investment_banking:/\binvestment bank(?:ing)?\b|投资银行/i,
    asset_management:/^(?!.*\b(?:software|hardware|IT) asset management\b).*?(?:\basset management\b|资产管理)/i,
    insurance:/\binsurance\b|保险/i
  };


// Within-dimension descriptors add information orthogonal to profession and grade.
export const ACTIVITY_MODE_LABELS = {own_outcome:'Outcome Ownership',approve_decide:'Approval & Decision Authority',advise_recommend:'Advice & Recommendations',execute_deliver:'Execution & Delivery',coordinate_enable:'Coordination & Enablement',independent_assurance:'Independent Challenge & Assurance',not_established:'Responsibility Boundary Unclear'};
export const ACTIVITY_MODES = {
  own_outcome:'Owns an explicit recurring business/product/process outcome or KPI with discretion and accountability. The word own/lead in generic boilerplate is insufficient.',
  approve_decide:'Makes or signs off the substantive credit, investment, policy, design or acceptance decision. Preparing analysis for another decision maker is advice, not approval.',
  advise_recommend:'Produces judgement, advice, analysis or recommendations used by another accountable decision maker; not implied by Analyst title.',
  execute_deliver:'Personally builds, processes, investigates or delivers specified outputs under an established remit. This concerns task responsibility, not whether the employee manages staff.',
  coordinate_enable:'Primarily coordinates inputs, documentation, dependencies or support so another owner can deliver; not every role with stakeholders.',
  independent_assurance:'Independently challenges or validates others’ decisions, models or controls; routine self-checking is not independent assurance.',
  not_established:'The dominant responsibility boundary is not supported by actual recurring duties. Do not infer from profession or leadership level.'
};
export const CLIENT_SEGMENT_LABELS = {individual_consumers:'Individual / Retail Clients',affluent_hnw:'Affluent / HNW Clients',uhnw_private:'UHNW / Private-bank Clients',sme_midmarket:'SME / Mid-market Clients',corporate_multinational:'Corporate / Multinational Clients',financial_public_institutions:'Financial / Public Institutions',explicit_mixed_clients:'Explicit Mixed Client Segments',own_institution:'Own Institution / Employees',not_established:'Client Segment Unclear'};
export const CLIENT_SEGMENTS = {
  individual_consumers:'Explicit everyday consumer/retail customers; not employer brand or a mortgage product without customer assignment.',
  affluent_hnw:'Explicit premier/affluent/HNW customers, including 丰盛理财/卓越理财; wealth alone does not establish UHNW/private banking.',
  uhnw_private:'Explicit UHNW or private-bank client book. A wealthy counterparty or family-office collaborator is insufficient.',
  sme_midmarket:'Explicit SME, owner-managed, small business or mid-market client portfolio.',
  corporate_multinational:'Explicit corporate/large company/multinational client coverage. Do not infer merely from lending or CIB division.',
  financial_public_institutions:'Explicit financial institutions, banks, insurers, asset managers, sovereign/public-sector institutional client coverage.',
  explicit_mixed_clients:'At least two explicitly served client segments with material duties for each; a division name or collaborator list is insufficient.',
  own_institution:'The actual beneficiary is the employing institution, its own finances/controls or employees, not external clients.',
  not_established:'No specific client/beneficiary segment is established. Preserve a known business/product line independently.'
};
export const EMPLOYMENT_LABELS = {permanent:'Explicit Permanent Employment',fixed_term:'Fixed-term Employment',temporary_agency:'Temporary / Agency Employment',contractor:'Contractor Engagement',secondment:'Secondment',not_disclosed:'Employment Terms Unspecified'};
export const EMPLOYMENT_TERMS = {
  permanent:'The advertised position itself is explicitly permanent or indefinite; never inferred from absence of contract terms.',
  fixed_term:'The advertised position itself has a fixed end date, duration or fixed-term employment clause.',
  temporary_agency:'The advertised worker is explicitly temporary or employed/payrolled through an agency; managing agencies is not evidence.',
  contractor:'The advertised worker is engaged as a contractor/consultant under contingent terms; advising on client contracts is not evidence.',
  secondment:'The advertised worker itself is on an explicitly stated secondment arrangement.',
  not_disclosed:'The posting does not explicitly establish employment terms. Neither a normal vacancy nor a job title proves permanent employment.'
};
export const ROLE_CONSTRAINT_LABELS = {revenue_targets:'Revenue / Acquisition Targets',on_call_shift:'Shift / On-call Obligations',travel_mobility:'Travel / Location Obligations',approval_accountability:'Approval / Sign-off Accountability',time_critical_delivery:'Time-critical Service Commitments',none_explicit:'No Explicit Condition Identified'};
export const ROLE_CONSTRAINTS = {
  revenue_targets:'Explicit personal/book revenue, acquisition, sales or commercial KPI accountability. Generic business growth or supporting sales is insufficient; do not infer workload or compensation.',
  on_call_shift:'Explicit shifts, on-call rota, nights/weekends or out-of-hours response expected of this worker. General production support alone is insufficient.',
  travel_mobility:'Explicit regular travel, relocation or multi-site presence expected of this worker. Client geography and a global employer alone are insufficient.',
  approval_accountability:'Explicit authority or accountability to approve/sign off financial, risk, regulatory or material operational decisions. Generic compliance obligations do not qualify.',
  time_critical_delivery:'Explicit market cut-offs, settlement deadlines, service SLA or incident-response commitments. Normal deadlines and vague fast-paced language are insufficient.',
  none_explicit:'No such material condition is explicitly evidenced. This is an extraction result, never a claim that the role is low-risk or has no obligations.'
};
export const DIMENSION_FRAMEWORK = {
  roleArchetype:'Professional track and durable accountable mandate; neither title grade nor business segment defines the occupation.',
  primaryActivity:'Dominant recurring deliverable plus task responsibility: own, decide, advise, execute, coordinate or independently assure. Never default from profession.',
  businessLine:'Narrowest supported served business plus independently evidenced beneficiary segment. Retain a supported parent assignment when finer detail is absent.',
  leadershipLevel:'Current authority over delivery and people. Grade, geography and past experience do not establish reports; distinguish hands-on work from proof of no reports.',
  roleRisk:'Evidence-backed structural concerns, consequential accountability, employment terms and up to two material operating obligations. Report concrete clarification gaps, not invented risks or a low-risk verdict.'
};

export const RISK_EXPOSURE_LABELS = {financial_processing_integrity:'Financial Processing Accuracy',client_commercial_outcomes:'Client / Commercial Outcome Accountability',regulated_case_control:'Regulatory / Case Integrity Accountability',capital_investment_credit:'Capital / Investment Decision Accountability',live_service_reliability:'Live Service Reliability',delivery_dependencies:'Delivery / Dependency Accountability',not_established:'Responsibility Exposure Unclear'};
export const RISK_EXPOSURES = {
  financial_processing_integrity:'Role-specific duties explicitly require accurate financial transaction processing, credit/fund documentation, reconciliation or financial controls. Describes the accountability of the work; never predicts losses, workload or mistakes.',
  client_commercial_outcomes:'Explicit responsibility for client revenue, acquisition, retention or relationship outcomes; incidental client contact and generic business growth are insufficient.',
  regulated_case_control:'Explicit substantive responsibility for regulated investigations, case findings, control assurance or compliance decisions. Universal employee conduct/privacy clauses are insufficient.',
  capital_investment_credit:'Explicit responsibility for investment, trading-book, lending/credit approval or capital decisions. Preparing data for these teams does not inherit decision accountability.',
  live_service_reliability:'Explicit responsibility for live production availability, incident resolution or service reliability. Merely building code/data does not imply a production support obligation.',
  delivery_dependencies:'Explicit accountability for interdependent milestones, hand-offs, implementation or delivery dependencies. Normal stakeholder collaboration is insufficient.',
  not_established:'No specific consequential accountability is established in the actual duties. Do not turn the typical risks of a profession into a finding about this role.'
};
