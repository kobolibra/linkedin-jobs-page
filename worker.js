const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const MAX_BODY_BYTES = 48_000;
const MAX_DESCRIPTION_CHARS = 30_000;
const PROVIDER_TIMEOUT_MS = 35_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const recentRequests = new Map();

const DEFAULT_PROVIDER_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-1.13.0";
const TAXONOMY_VERSION = "jev-taxonomy-v3.1";

const ROLE_FAMILIES = {
  CS: "Client & Commercial", IR: "Investment, Markets & Research", RC: "Risk, Compliance & Assurance",
  OP: "Operations & Service", PS: "Product, Strategy & Transformation", TE: "Technology & Engineering",
  CF: "Corporate & Finance",
};
const ROLE_ARCHETYPE_LABELS = {
  CS1_relationship_management: "Relationship Management & Coverage",
  CS2_acquisition_direct_sales: "Acquisition & Direct Sales",
  CS3_product_specialist_advisory: "Product Specialist & Advisory",
  CS4_customer_service_frontline: "Customer Service & Frontline",
  CS5_investment_banking_advisory: "Investment Banking Advisory",
  CS6_markets_sales_trading: "Markets Sales & Trading",
  IR1_investment_research: "Investment Research",
  IR2_portfolio_management: "Portfolio Management",
  RC1_credit_risk: "Credit Risk",
  RC2_financial_crime: "Financial Crime",
  RC3_compliance_legal: "Compliance & Legal",
  RC4_enterprise_risk: "Enterprise Risk",
  RC5_internal_audit: "Internal Audit",
  OP1_banking_operations: "Banking Operations",
  OP2_securities_fund_services: "Securities & Fund Services",
  PS1_product_management: "Product Management",
  PS2_business_analysis_change: "Business Analysis & Change",
  PS3_strategy_business_management: "Strategy & Business Management",
  PS4_experience_design_research: "Experience Design & Research",
  TE1_software_engineering: "Software Engineering",
  TE2_platform_infrastructure_sre: "Platform, Infrastructure & SRE",
  TE3_architecture: "Technology Architecture",
  TE4_cyber_security: "Cybersecurity",
  TE5_data_engineering_analytics: "Data Engineering & Analytics",
  TE6_ai_ml_quant: "AI, ML & Quantitative Analytics",
  TE7_technology_management_delivery: "Technology Management & Delivery",
  CF1_finance_accounting: "Finance & Accounting",
  CF2_treasury_alm: "Treasury & ALM",
  CF3_hr_people: "HR & People",
  CF4_marketing_communications: "Marketing & Communications",
  CF5_corporate_services: "Corporate Services",
  CF6_actuarial_insurance_technical: "Actuarial & Insurance Technical",
  other_profession: "Other Clear Profession",
  insufficient_evidence: "Insufficient Evidence",
  not_applicable: "Not Applicable"
};
const ROLE_ARCHETYPES = {
  CS1_relationship_management: "Owns and develops a named client, account or relationship portfolio, including relationship managers, coverage bankers, private or premier relationship roles and portfolio-support roles. NOT acquisition-only, product-specialist support or customer service without portfolio ownership.",
  CS2_acquisition_direct_sales: "Acquires new clients or revenue through direct sales, business development, channel or partnership development, tele-sales or distribution leadership without owning an established portfolio. NOT ongoing relationship coverage.",
  CS3_product_specialist_advisory: "Provides specialist product expertise, product advice or product-led sales alongside relationship owners, such as transaction banking, wealth-product or investment specialists. NOT product lifecycle ownership.",
  CS4_customer_service_frontline: "Provides on-demand customer, branch, contact-centre, complaint or frontline service without substantive sales or portfolio ownership. NOT acquisition, relationship coverage or back-office processing.",
  CS5_investment_banking_advisory: "Delivers M&A, ECM, DCM, syndicated lending, structured finance or corporate-finance advisory and execution. NOT generic strategy or markets trading.",
  CS6_markets_sales_trading: "Works on a Global Markets desk in sales, trading, structuring, execution or desk analysis for market products. NOT corporate-finance lending origination.",
  IR1_investment_research: "Produces investment, market, economic or sector research, strategy, stewardship or proxy-voting recommendations. NOT portfolio ownership.",
  IR2_portfolio_management: "Owns or makes portfolio, fund, FOF, discretionary mandate or asset-allocation investment decisions. NOT research-only or product advisory.",
  RC1_credit_risk: "Performs borrower credit analysis, approval, underwriting, monitoring, restructuring, collections or credit portfolio risk. NOT enterprise operational risk.",
  RC2_financial_crime: "Performs KYC, CDD, AML, sanctions, fraud, transaction monitoring, investigations or financial-crime controls, including second-line financial-crime work. NOT general compliance.",
  RC3_compliance_legal: "Performs regulatory compliance advice, monitoring, regulatory affairs, legal or company-secretarial work. NOT financial-crime investigation or independent internal audit.",
  RC4_enterprise_risk: "Performs enterprise, operational, resilience, model or non-financial risk management, control testing or assurance in the first or second line. NOT independent third-line internal audit.",
  RC5_internal_audit: "Performs independent third-line internal audit, assurance testing, audit reporting or audit issue follow-up. NOT first- or second-line control ownership.",
  OP1_banking_operations: "Performs banking operations such as payments, trade, lending, branch operations, transaction processing, settlement coordination or operational servicing. NOT securities/fund administration.",
  OP2_securities_fund_services: "Performs custody, fund accounting, transfer agency or securities-services administration. NOT generic banking operations.",
  PS1_product_management: "Owns digital, payments, wealth or other product definition, roadmap, lifecycle, governance and product outcomes. NOT product sales/advisory.",
  PS2_business_analysis_change: "Performs business analysis, requirements, business-side change, project or delivery work for a defined outcome. NOT hands-on software engineering.",
  PS3_strategy_business_management: "Drives enterprise strategy, transformation, COO-office, business management, PMO or programme execution, including technology COO-office roles. NOT a single delivery workstream only.",
  PS4_experience_design_research: "Performs UX/UI, service design, user research or experience design as the principal work product. NOT product ownership alone.",
  TE1_software_engineering: "Builds, tests, deploys and maintains applications or software systems, including hands-on technical leads and senior developers. NOT architecture governance or platform operations as the dominant output.",
  TE2_platform_infrastructure_sre: "Builds or operates cloud, infrastructure, host, mainframe, middleware, DevOps, SRE, observability or production reliability platforms. NOT application feature engineering or AI/ML product work.",
  TE3_architecture: "Owns enterprise, solution or technical architecture, standards and cross-system design governance without hands-on delivery as the dominant output. NOT a hands-on developer.",
  TE4_cyber_security: "Owns cybersecurity engineering, security operations, cyber architecture, threat, identity or security assurance. NOT generic technology risk or compliance.",
  TE5_data_engineering_analytics: "Builds data platforms, data pipelines, BI, reporting or production analytics. NOT advanced AI/ML or quantitative modelling as the dominant output.",
  TE6_ai_ml_quant: "Performs AI/ML, GenAI, LLM/agent engineering, quantitative modelling, statistical science or advanced analytics as the primary output. NOT ordinary BI or infrastructure operations.",
  TE7_technology_management_delivery: "Leads technology engineering teams, technical domains, delivery portfolios, IT service management, major-incident management or technology programme delivery. NOT a technical individual contributor whose main output is code or architecture.",
  CF1_finance_accounting: "Performs accounting, financial control, regulatory reporting, product control, FP&A, tax or finance operations, including insurance-finance reporting. NOT treasury/ALM or actuarial modelling.",
  CF2_treasury_alm: "Owns treasury, asset-liability management, capital, liquidity, funding, FTP or balance-sheet management. NOT ordinary financial control.",
  CF3_hr_people: "Performs HR, recruitment, talent, reward, learning and development or people operations work.",
  CF4_marketing_communications: "Performs marketing, brand, communications, content or customer communications work.",
  CF5_corporate_services: "Performs procurement, sourcing, vendor management, administration, workplace, facilities, corporate real estate or other corporate-services work.",
  CF6_actuarial_insurance_technical: "Performs actuarial pricing, valuation, reserving, capital or IFRS 17 modelling, or insurance underwriting, claims or reinsurance technical work. NOT insurance finance reporting alone.",
  other_profession: "A clear profession outside the controlled taxonomy. Do not use when evidence is merely thin.",
  insufficient_evidence: "Core responsibilities are too thin, generic or contradictory to classify.",
  not_applicable: "Not a substantive single job posting or evidence is not applicable."
};
var ARCHETYPE_FAMILY = Object.fromEntries(Object.keys(ROLE_ARCHETYPES).map(key => [key, key.match(/^(CS|IR|RC|OP|PS|TE|CF)/)?.[1] || null]));
var ARCHETYPE_PRIMARY_ACTIVITY = {
  CS1_relationship_management: "client_relationships", CS2_acquisition_direct_sales: "sales_origination", CS3_product_specialist_advisory: "product_advisory", CS4_customer_service_frontline: "client_relationships", CS5_investment_banking_advisory: "research_analysis", CS6_markets_sales_trading: "trading_execution",
  IR1_investment_research: "research_analysis", IR2_portfolio_management: "investment_decisions", RC1_credit_risk: "risk_control", RC2_financial_crime: "compliance_governance", RC3_compliance_legal: "compliance_governance", RC4_enterprise_risk: "risk_control", RC5_internal_audit: "control_assurance",
  OP1_banking_operations: "operations_processing", OP2_securities_fund_services: "operations_processing", PS1_product_management: "product_ownership", PS2_business_analysis_change: "change_delivery", PS3_strategy_business_management: "strategy_transformation", PS4_experience_design_research: "experience_design",
  TE1_software_engineering: "technology_build", TE2_platform_infrastructure_sre: "technology_build", TE3_architecture: "technology_architecture", TE4_cyber_security: "security_protection", TE5_data_engineering_analytics: "data_analytics", TE6_ai_ml_quant: "data_analytics", TE7_technology_management_delivery: "delivery_management",
  CF1_finance_accounting: "finance_control", CF2_treasury_alm: "finance_control", CF3_hr_people: "people_leadership", CF4_marketing_communications: "other_unknown", CF5_corporate_services: "corporate_services", CF6_actuarial_insurance_technical: "actuarial_technical"
};
function deriveTitleSignals(title, company) {
  const t = String(title || "").trim();
  const low = t.toLowerCase();
  const c = String(company || "").toLowerCase();
  const tags = [];
  if (/\b(associate director|director\s*\/\s*vp|associate\s*\/\s*vp|vp\s*\/\s*director)\b/i.test(low)) tags.push("range_title");
  if (/\b(product owner|scrum master)\b/i.test(low)) tags.push("role_name_not_level");
  if (/\b(fellow|distinguished engineer|staff engineer|principal engineer)\b/i.test(low)) tags.push("technical_ladder");
  if (/\b(relationship|business development|sales|premier|wealth manager)\b/i.test(low)) tags.push("client_facing_title");
  if (/\b(consultant specialist|senior consultant specialist)\b/i.test(low)) tags.push("opaque_generic_title");
  if (c.includes("hsbc") && /\bpremier relationship director\b/i.test(low)) return { market: "director_or_head", normalized: "professional", tags: [...new Set([...tags, "client_facing_title"])], markers: ["premier_relationship_director"] };
  if (c.includes("standard chartered") && /\bbusiness development executive\b/i.test(low)) return { market: "executive", normalized: "professional", tags: [...new Set([...tags, "client_facing_title"])], markers: ["business_development_executive"] };
  let market = "unknown";
  if (/\b(intern|graduate|trainee|assistant)\b|实习|管培/i.test(low)) market = "entry";
  else if (/\b(chief|cso|cto|cfo|ceo|country head|business head|managing director)\b|首席|国家负责人/i.test(low)) market = "executive";
  else if (/\b(director|head|executive director|ed)\b|总监|董事/i.test(low)) market = "director_or_head";
  else if (/\b(vp|svp|avp|vice president|associate director)\b|副总裁/i.test(low)) market = "manager_or_lead";
  else if (/\b(manager|lead|principal|staff|senior)\b|经理|主管|高级/i.test(low)) market = /\b(manager|lead)\b|经理|主管/i.test(low) ? "manager_or_lead" : "senior_individual_contributor";
  else if (/\b(analyst|associate|consultant|specialist|officer|executive)\b|分析师|专员|主任/i.test(low)) market = "professional";
  return { market, normalized: tags.includes("role_name_not_level") ? "unknown" : market, tags: [...new Set(tags)], markers: [] };
}
function roleFamilyOf(value) { return ARCHETYPE_FAMILY[value] || String(value || "").match(/^(CS|IR|RC|OP|PS|TE|CF)/)?.[1] || null; }
const LEGACY_ARCHETYPE_MAP = {
  client_relationship_coverage: "CS1_relationship_management", direct_sales_origination: "CS2_acquisition_direct_sales", product_sales_advisory: "CS3_product_specialist_advisory", customer_service_frontline: "CS4_customer_service_frontline", investment_banking_advisory: "CS5_investment_banking_advisory", markets_sales_trading: "CS6_markets_sales_trading", investment_research_strategy: "IR1_investment_research", portfolio_management: "IR2_portfolio_management", credit_underwriting: "RC1_credit_risk", enterprise_risk: "RC4_enterprise_risk", financial_crime_kyc_aml: "RC2_financial_crime", compliance_regulatory: "RC3_compliance_legal", internal_audit: "RC5_internal_audit", operations_settlement_servicing: "OP1_banking_operations", securities_services_fund_admin: "OP2_securities_fund_services", product_management_governance: "PS1_product_management", business_analysis_delivery: "PS2_business_analysis_change", strategy_transformation: "PS3_strategy_business_management", software_application_engineering: "TE1_software_engineering", platform_cloud_reliability_engineering: "TE2_platform_infrastructure_sre", technology_architecture_delivery: "TE3_architecture", technology_architecture: "TE3_architecture", cybersecurity: "TE4_cyber_security", data_ai_quantitative_analytics: "TE6_ai_ml_quant", finance_accounting_treasury_control: "CF1_finance_accounting", people_marketing_corporate_services: "CF5_corporate_services", CS1: "CS1_relationship_management", CS2: "CS2_acquisition_direct_sales", CS3: "CS3_product_specialist_advisory", CS4: "CS4_customer_service_frontline", CS5: "CS5_investment_banking_advisory", CS6: "CS6_markets_sales_trading", IR1: "IR1_investment_research", IR2: "IR2_portfolio_management", IR3: "RC1_credit_risk", RC1: "RC4_enterprise_risk", RC2: "RC2_financial_crime", RC3: "RC3_compliance_legal", RC4: "RC5_internal_audit", OP1: "OP1_banking_operations", OP2: "OP2_securities_fund_services", OP3: "OP1_banking_operations", PS1: "PS1_product_management", PS2: "PS2_business_analysis_change", PS3: "PS3_strategy_business_management", PS4: "TE3_architecture", TE1: "TE1_software_engineering", TE2: "TE2_platform_infrastructure_sre", TE3: "TE4_cyber_security", TE4: "TE3_architecture", TE5: "TE5_data_engineering_analytics", TE6: "TE6_ai_ml_quant", CF1: "CF1_finance_accounting", CF2: "CF3_hr_people", CF3: "CF4_marketing_communications", CF4: "RC3_compliance_legal", CF5: "CF5_corporate_services", CF6: "CF5_corporate_services"
};

const ACTIVITIES = {
  experience_design: "Performs user research, service design or experience design.",
  client_relationships: "Manages or develops client relationships and coverage.", sales_origination: "Generates, structures or distributes business.",
  research_analysis: "Performs research, analysis or produces recommendations.", investment_decisions: "Makes or supports investment or portfolio decisions.",
  trading_execution: "Executes or facilitates trades and market transactions.", product_advisory: "Advises on products or solutions without owning the product lifecycle.",
  product_ownership: "Owns product definition, lifecycle or product outcomes.", technology_build: "Builds, tests, deploys or maintains technology.",
  data_analytics: "Performs data, quantitative, AI or analytics work.", operations_processing: "Executes operational, processing, settlement or servicing work.",
  risk_control: "Performs risk assessment, control or assurance work.", compliance_governance: "Performs compliance, regulatory, governance or financial-crime work.",
  strategy_transformation: "Drives strategy, change, transformation or programme execution.", reporting_coordination: "Coordinates reporting, stakeholders or management information.",
  finance_control: "Performs accounting, treasury, financial control or planning work.", people_leadership: "Leads people or teams as a substantive part of the role.",
  other_unknown: "Another activity or insufficient evidence.", none: "No additional activity is materially supported by the JD.",
};

const BUSINESS_PRODUCTS = {
  none: "No materially worked-on product.", deposits_accounts_payments: "Deposits, accounts or payments.", cards_unsecured_lending: "Cards or unsecured lending.", mortgages_secured_lending: "Mortgages or secured lending.", corporate_lending_structured_finance: "Corporate lending or structured finance.", trade_finance_supply_chain: "Trade finance or supply chain finance.", cash_management_liquidity: "Cash management or liquidity.", fx_rates_derivatives: "FX, rates or derivatives.", equities_fixed_income_securities: "Equities, fixed income or securities.", structured_products: "Structured products.", funds_mutual_private: "Mutual, investment or private-market funds.", discretionary_mandates_advisory: "Discretionary mandates or investment advisory.", insurance_bancassurance: "Insurance or bancassurance.", custody_fund_services: "Custody or fund services.", digital_channels_mobile_banking: "Digital channels or mobile banking.",
};
const TECHNOLOGY_PLATFORMS = { none: "No materially owned technology platform.", business_applications: "Business applications.", apis_and_microservices: "APIs or microservices platforms.", cloud_platforms: "Cloud platforms.", platform_infrastructure: "Infrastructure platforms or networks.", data_platforms: "Data platforms, warehouses or lakes.", ai_ml_platforms: "AI/ML platforms or model serving.", reliability_observability: "Reliability, observability or production platforms.", trading_systems: "Trading, order-management or market systems." };
const TITLE_LEVELS = { entry: "Entry / early-career title signal.", professional: "Professional title signal without a clear senior marker.", senior_individual_contributor: "Senior, staff, principal or equivalent IC title signal.", manager_or_lead: "Manager, lead or equivalent team-lead title signal.", director_or_head: "Director, head or equivalent senior leadership title signal.", executive: "Executive, managing director, business head or C-suite title signal.", unknown: "The title does not provide a reliable level signal." };
const SENIORITY_ALIGNMENT = { aligned: "Title level and JD responsibility are materially aligned.", title_higher_than_scope: "Title signals a higher level than the responsibility supported by the JD.", title_lower_than_scope: "JD responsibility signals a higher level than the title.", ambiguous: "Title and JD contain materially conflicting or insufficient level evidence." };

const ROLE_LEVELS = { entry: "Intern, graduate, trainee, assistant or entry-level role.", professional: "Analyst, associate, consultant or established professional role.", senior_individual_contributor: "Senior or experienced individual contributor without clear people-management responsibility.", manager_or_lead: "Manager, senior manager, lead, principal or team lead.", director_or_head: "Director, head of a function or equivalent senior leader.", executive: "C-suite, country head, business head, managing director or executive leader.", unknown: "The role level cannot be determined." };
const BUSINESS_DOMAINS = { other_unknown: "Retained compatibility field; the six-field card uses served business line and operating context." };
const SERVED_BUSINESS_LINES = { personal_retail: "Personal or retail banking.", wealth_premier: "Premier or retail wealth.", private_banking: "Private banking.", commercial_business: "Commercial banking.", corporate_institutional: "Corporate or institutional banking.", transaction_banking_payments_trade: "Transaction banking, payments or trade.", securities_services: "Securities services and fund administration.", global_markets: "Global markets.", investment_banking_advisory: "Investment banking and advisory.", asset_management_funds: "Asset management and funds.", insurance: "Insurance.", group_functions_enterprise: "Group or enterprise functions.", multi_line: "Multiple explicitly served business lines.", not_stated: "Not stated." };
const OPERATING_CONTEXTS = { onshore_bank_business_unit: "Onshore bank business unit.", shared_service_centre: "Shared service or operations centre.", technology_development_centre: "Technology development centre.", securities_or_ib_jv: "Securities or investment-banking joint venture.", asset_management_or_wealth_entity: "Asset-management or wealth entity.", insurance_entity: "Insurance entity.", consumer_finance_or_other: "Consumer finance or other entity.", not_stated: "Not stated." };
const RISK_CODES = { none: "No material structural risk.", title_scope_mismatch: "Title and actual responsibilities materially differ.", seniority_ambiguity: "Seniority signals are ambiguous or inconsistent.", responsibility_ambiguity: "Mandate, ownership boundary or outcomes are unclear.", leadership_ambiguity: "IC, team-lead and people-management signals conflict.", function_context_mismatch: "Title, function and business context point to different role types.", contradictory_scope: "Narrow execution and broad ownership are combined without explanation.", title_inflation_by_convention: "Employer title convention overstates market level.", multiple_roles_in_one_jd: "Multiple distinct roles or locations are combined.", range_level_posting: "Title covers a hiring range rather than one level.", bilingual_content_conflict: "Bilingual versions contain different role evidence.", vendor_or_outsourced_ambiguity: "Employment or accountability boundary appears outsourced.", location_or_entity_ambiguity: "Location, legal entity or operating context is ambiguous.", requirements_dominate_over_responsibilities: "Requirements dominate while role responsibilities are thin.", template_placeholder_text: "The JD contains unresolved placeholders.", machine_translation_or_encoding_issues: "Likely translation or encoding defects.", responsibilities_generic_or_template: "Responsibilities are dominated by generic/template language." };
const STRUCTURAL_RISK_CODES = Object.fromEntries(Object.entries(RISK_CODES).filter(([key]) => !["template_placeholder_text", "responsibilities_generic_or_template", "requirements_dominate_over_responsibilities", "machine_translation_or_encoding_issues", "requirements_dominate_over_responsibilities"].includes(key)));
const RISK_SEVERITIES = { low: "Limited structural concern.", medium: "Material concern for comparison.", high: "Significant concern likely to mislead.", unknown: "Severity cannot be determined." };
const MANDATE_SCOPES = { individual_delivery: "Primarily owns individual delivery.", workstream_or_project: "Owns a defined workstream, project, book of work or specialist area.", team_or_function: "Owns a team, function or major programme mandate.", business_unit_or_region: "Owns a business unit, country, region or material commercial mandate.", enterprise: "Owns an enterprise-wide or group-level mandate.", unknown: "Insufficient evidence." };
const DECISION_AUTHORITIES = { execution: "Executes defined work without explicit decision ownership.", recommendation: "Provides recommendations, analysis or advice without final authority.", approval: "Has explicit approval, authorization or sign-off authority.", ownership: "Owns a business outcome, mandate or material decision domain.", unknown: "Insufficient evidence." };
const LEADERSHIP_LEVELS = { individual_contributor: "No people-leadership responsibility is stated; this is the default for a readable JD.", informal_mentor_or_lead: "Repeated mentoring, coaching or informal initiative leadership without team ownership.", team_lead: "Explicitly leads a team, squad, pod or workstream without formal people management.", people_manager: "Explicitly manages direct reports, hiring, performance or a team.", manager_of_managers: "Explicitly manages team leaders, multiple teams or a function.", not_stated: "The JD is too thin to determine leadership." };

const FUNCTION_CRITERIA = {
  client_commercial: "Client, sales, relationship management, commercial origination or business development.",
  markets_investment_research: "Markets, trading, investment management, portfolio management, research or capital markets.",
  risk_compliance_legal: "Risk, compliance, audit, controls, legal, regulatory affairs or financial crime.",
  operations_service: "Operations, middle/back office, service delivery, processing or administration.",
  technology_engineering: "Software, data engineering, infrastructure, cybersecurity or technical engineering.",
  data_ai_analytics: "Data science, AI, analytics, quantitative analysis or business intelligence.",
  finance_accounting_treasury: "Corporate finance, accounting, treasury, tax, FP&A or financial control.",
  product_strategy_transformation: "Product management, strategy, transformation, change or project/program management.",
  people_marketing_corporate_services: "Human resources, marketing, communications, procurement or other corporate services.",
  unknown: "The job description does not contain enough evidence to choose a function.",
};

const BUSINESS_CRITERIA = {
  banking: "Banking, lending, payments or financial institutions.",
  asset_management_funds: "Asset management, investment funds, wealth management or private banking.",
  markets_securities: "Capital markets, securities, trading, brokerage or derivatives.",
  insurance: "Insurance or reinsurance.",
  fintech_payments: "Fintech, payments technology or financial infrastructure.",
  technology: "Technology/software as the main business domain.",
  professional_services: "Consulting, accounting, law or professional services.",
  real_estate: "Real estate or property.",
  public_sector: "Government, public sector or non-profit.",
  other_unknown: "Another domain or insufficient evidence.",
};

const questions = {
  function: {
    type: "choice",
    instructions: "What is the single primary job function of this role? Choose based on the responsibilities, not the title alone.",
    criteria: FUNCTION_CRITERIA,
  },
  seniorityBand: {
    type: "choice",
    instructions: "What seniority band is required by the job description?",
    criteria: {
      executive_head: "C-suite, country head, business head, managing director or executive leader.",
      director: "Director, associate director, head of a function or equivalent senior leader.",
      vp_svp_avp: "VP, SVP, AVP or equivalent.",
      manager_lead_principal: "Manager, senior manager, lead, principal or team lead.",
      senior_experienced_ic: "Senior or experienced individual contributor without clear people-management responsibility.",
      analyst_associate_consultant: "Analyst, associate, consultant or professional early in the track.",
      entry_early_career: "Intern, graduate, trainee, assistant or entry-level role.",
      unclear: "The seniority cannot be determined from the description.",
    },
  },
  responsibilityLevel: {
    type: "choice",
    instructions: "What is the highest responsibility level explicitly supported by the text?",
    criteria: {
      enterprise_or_business_unit: "Owns an enterprise, country, business unit, P&L or broad strategic mandate.",
      functional_leadership: "Owns a function, major program or team-wide mandate.",
      workstream_or_project: "Owns a defined project, workstream, book of work or specialist area.",
      individual_contributor: "Primarily executes individual contributor work.",
      unclear: "Not enough evidence to determine this.",
    },
  },
  isFormalPeopleManager: {
    type: "choice",
    instructions: "Does the role explicitly require formal people management or direct reports?",
    criteria: {
      yes: "Explicitly manages people, has direct reports, hires, evaluates or owns a team.",
      no: "Explicitly an individual contributor or no management requirement is stated.",
      unknown: "The description does not make this clear.",
    },
  },
  teamLeadershipRequired: {
    type: "choice",
    instructions: "Is leading a team, squad or people explicitly required, even if formal management is not clear?",
    criteria: {
      yes: "Team leadership, people leadership or supervision is explicitly required.",
      no: "No team-leadership requirement is stated.",
      unknown: "The wording is ambiguous.",
    },
  },
  riskFlag: {
    type: "choice",
    instructions: "What is the single most important structural ambiguity or risk to flag for a human reviewer?",
    criteria: {
      none: "The description is sufficiently clear for the requested fields.",
      title_scope_mismatch: "The title and the actual responsibilities appear materially different.",
      seniority_ambiguity: "The seniority level is ambiguous or internally inconsistent.",
      responsibility_ambiguity: "The mandate, ownership boundary or expected outcomes are materially unclear.",
      leadership_ambiguity: "The JD mixes individual-contributor, team-lead and people-management signals without clarifying the boundary.",
      function_context_mismatch: "The title, function and business context point to materially different role types.",
      contradictory_scope: "The JD combines narrow execution and broad ownership without explaining the relationship.",
    },
  },
};

questions.roleArchetype = { type: "choice", instructions: "What single controlled role archetype best describes the profession being hired? Classify from ownership, recurring responsibilities and outputs, not the title alone.", criteria: {
  client_relationship_coverage: "Owns client relationships, account coverage or relationship portfolios.", sales_origination_distribution: "Generates, structures, sells or distributes business, products or revenue.", customer_service_acquisition: "Performs customer service, contact-centre, frontline or customer-acquisition work.", investment_research_strategy: "Produces investment, market, economic or sector research and strategy.", portfolio_management_asset_allocation: "Makes or supports portfolio-management, asset-allocation or investment decisions.", markets_sales_trading_structuring: "Works in markets sales, trading, structuring or market execution.", credit_underwriting_risk: "Performs credit assessment, underwriting, credit monitoring or portfolio-risk work.", risk_compliance_financial_crime: "Performs compliance, AML, sanctions, surveillance, investigations or control work.", operations_settlement_servicing: "Performs settlement, clearing, fund, transaction, middle-office or servicing operations.", product_management_governance: "Owns product definition, lifecycle, governance or product outcomes.", software_application_engineering: "Builds and maintains business applications or software systems.", platform_cloud_reliability_engineering: "Builds platforms, cloud, infrastructure, SRE or production reliability capabilities.", technology_architecture_delivery: "Owns solution architecture, technical delivery, programme delivery or technical design.", data_ai_quantitative_analytics: "Performs data engineering, AI/ML, quantitative analysis or advanced analytics.", finance_accounting_treasury_control: "Performs accounting, financial control, treasury, FP&A or actuarial-finance work.", strategy_transformation_programme: "Drives enterprise strategy, transformation, change or programme execution.", people_marketing_corporate_services: "Performs HR, recruitment, marketing or corporate-services work.", other_unknown: "Another role type or insufficient evidence.",
} };
questions.primaryActivity = { type: "choice", instructions: "What is the single dominant work activity of this role?", criteria: {
  client_relationships: "Manages or develops client relationships and coverage.", sales_origination: "Generates, structures or distributes business.", research_analysis: "Performs research, analysis or produces recommendations.", investment_decisions: "Makes or supports investment or portfolio decisions.", trading_execution: "Executes or facilitates trades and market transactions.", product_advisory: "Advises on products or solutions without owning the product lifecycle.", product_ownership: "Owns product definition, lifecycle or product outcomes.", technology_build: "Builds, tests, deploys or maintains technology.", data_analytics: "Performs data, quantitative, AI or analytics work.", operations_processing: "Executes operational, processing, settlement or servicing work.", risk_control: "Performs risk assessment, control or assurance work.", compliance_governance: "Performs compliance, regulatory, governance or financial-crime work.", strategy_transformation: "Drives strategy, change, transformation or programme execution.", reporting_coordination: "Coordinates reporting, stakeholders or management information.", finance_control: "Performs accounting, treasury, financial control or planning work.", people_leadership: "Leads people or teams as a substantive part of the role.", other_unknown: "Another activity or insufficient evidence.",
} };
questions.businessDomainV2 = { type: "choice", instructions: "What single business context does this role operate in? Distinguish the role's business context from its professional function.", criteria: {
  retail_banking: "Retail or consumer banking.", commercial_corporate_banking: "Commercial, corporate or wholesale banking.", wealth_private_banking: "Wealth management or private banking.", capital_markets: "Capital markets, securities, trading or investment banking.", asset_management: "Asset management, funds or institutional investing.", insurance: "Insurance or reinsurance.", fintech_payments: "Fintech, payments or financial infrastructure.", technology_services: "Technology or software services as the primary business context.", corporate_enterprise: "Enterprise corporate or shared-services context.", other_unknown: "Another context or insufficient evidence.",
} };
questions.mandateScope = { type: "choice", instructions: "What is the broadest mandate explicitly supported by the JD?", criteria: { individual_delivery: "Primarily owns individual delivery.", workstream_or_project: "Owns a defined workstream, project, book of work or specialist area.", team_or_function: "Owns a team, function or major programme mandate.", business_unit_or_region: "Owns a business unit, country, region or material commercial mandate.", enterprise: "Owns an enterprise-wide or group-level mandate.", unknown: "Insufficient evidence." } };
questions.decisionAuthority = { type: "choice", instructions: "What is the highest decision authority explicitly supported by the JD?", criteria: { execution: "Executes defined work without explicit decision ownership.", recommendation: "Provides recommendations, analysis or advice without final authority.", approval: "Has explicit approval, authorization or sign-off authority.", ownership: "Owns a business outcome, mandate or material decision domain.", unknown: "Insufficient evidence." } };
questions.leadershipLevel = { type: "choice", instructions: "What single leadership level is explicitly supported by the JD?", criteria: { individual_contributor: "Individual contributor with no explicit leadership ownership.", informal_influencer: "Mentors, coordinates or influences without owning a team.", team_lead: "Leads a squad, project team or workstream without clear formal people management.", people_manager: "Explicitly manages people, hiring or performance.", functional_leader: "Owns a function or multiple teams.", unknown: "Insufficient evidence." } };

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function text(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
  const description = text(value.description, MAX_DESCRIPTION_CHARS);
  if (!description || description.length < 40) throw new Error("description_required");
  const rawInput = value.jevInput && typeof value.jevInput === "object" ? value.jevInput : null;
  const jevInput = rawInput ? {
    role_summary: text(rawInput.role_summary, 12_000), responsibilities: text(rawInput.responsibilities, 24_000),
    requirements: text(rawInput.requirements, 16_000), employer_metadata: text(rawInput.employer_metadata, 4_000),
    language: text(rawInput.language, 40), evidence_level: text(rawInput.evidence_level, 40),
    evidence_flags: Array.isArray(rawInput.evidence_flags) ? rawInput.evidence_flags.slice(0, 30).map(x => text(x, 100)) : [],
    title_signals: rawInput.title_signals && typeof rawInput.title_signals === "object" ? rawInput.title_signals : {},
    servedBusinessLineHint: text(rawInput.servedBusinessLineHint, 80), operatingContextHint: text(rawInput.operatingContextHint, 80),
  } : null;
  return {
    jobId: text(value.jobId, 200),
    title: text(value.title, 300),
    company: text(value.company, 300),
    location: text(value.location, 120),
    description,
    jevInput,
  };
}

export function buildProviderRequest(input, env) {
  const providerUrl = env.JEV_API_URL || DEFAULT_PROVIDER_URL;
  const model = env.JEV_MODEL || DEFAULT_MODEL;
  const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
  const noul = instructions => ({ type: "noul", instructions });
  const evidence = (question, rules) => `${question} Use only the single state fields \`responsibilities\`, \`role_summary\` and \`requirements\` as evidence. Rules: ${rules}`;
  const stateEvidence = (question, rules) => `${question} Use \`responsibilities\` and \`role_summary\` as primary evidence; use \`title\` only as a weak prior. Rules: ${rules}`;
  const questionMap = {
    postingType: choice(stateEvidence("What kind of posting is this?", "Choose specific_role, programme_intake, talent_pool_or_evergreen, multiple_distinct_roles or not_a_job_posting."), { specific_role: "One concrete role.", programme_intake: "Programme or intake.", talent_pool_or_evergreen: "Talent pool or evergreen posting.", multiple_distinct_roles: "Multiple distinct roles.", not_a_job_posting: "Not a job posting." }),
    roleArchetype: choice(stateEvidence("What single controlled archetype best describes the dominant profession being hired?", "Use the longest and most substantive responsibility output. Requirements, employer boilerplate and generic titles are weak evidence. Select not_applicable for a non-job posting or insufficient evidence for a thin/contradictory core."), ROLE_ARCHETYPES),
    servedBusinessLine: choice(stateEvidence("Which business line is served by this role?", "For technology, operations, risk and finance roles classify the consumer of the work, using explicit employer_metadata hints when present. Distinguish not_stated from multi_line."), { ...SERVED_BUSINESS_LINES, multi_line: "Explicitly serves multiple business lines.", not_stated: "No business line is stated." }),
    operatingContext: choice(stateEvidence("What operating context or legal/entity context is this role in?", "Classify by who consumes the work and explicit entity metadata; do not guess from a parent company name alone."), OPERATING_CONTEXTS),
    roleLevel: choice(stateEvidence("What role level is supported by title and responsibilities together?", "Responsibilities, scope, authority and people leadership outweigh title. Do not infer authority from requirements or generic leadership language."), ROLE_LEVELS),
    mandateScope: choice(stateEvidence("What is the broadest mandate explicitly supported?", "Choose individual_delivery, workstream_or_project, team_or_function, business_unit_or_region, enterprise or unknown."), MANDATE_SCOPES),
    decisionAuthority: choice(stateEvidence("What is the highest decision authority explicitly supported?", "Choose execution, recommendation, approval, ownership or not_stated. Support, review and accountability alone are not authority."), { ...DECISION_AUTHORITIES, not_stated: "The JD does not state authority." }),
    leadershipLevel: choice(stateEvidence("What leadership level is explicitly supported by responsibilities?", "No stated people-leadership responsibility defaults to individual_contributor for a readable JD. Collaboration, coordination and stakeholder management are not leadership. Use informal_mentor_or_lead only for repeated mentoring/coaching or informal initiative leadership."), LEADERSHIP_LEVELS),
    hasExplicitPeopleManagement: noul(stateEvidence("Is explicit people management present?", "Yes only for direct reports, hiring, performance management, team ownership or managing team leaders.")),
    hasExplicitTeamLeadership: noul(stateEvidence("Is explicit team, squad, pod or workstream leadership present without formal management?", "Require a repeated leadership responsibility, not collaboration language.")),
    workMix_clientFacing: noul(stateEvidence("Is substantive client-facing relationship or advisory work a repeated responsibility?", "Use responsibilities only.")),
    workMix_revenueAccountability: noul(stateEvidence("Is explicit sales, revenue, budget or P&L accountability a repeated responsibility?", "Do not infer from commercial context.")),
    workMix_technicalDelivery: noul(stateEvidence("Is personally building, testing, deploying or operating technology a repeated responsibility?", "Requirements-only technology skills do not count.")),
    workMix_analysis: noul(stateEvidence("Is producing analysis, research, modelling or recommendations a substantive output?", "Use recurring outputs.")),
    workMix_controlAssurance: noul(stateEvidence("Is control, compliance, audit, assurance or risk oversight a substantive output?", "Exclude boilerplate risk language.")),
    workMix_operationsProcessing: noul(stateEvidence("Is operational processing, settlement, servicing or administration a substantive output?", "Use recurring delivery responsibilities.")),
    workMix_changeDelivery: noul(stateEvidence("Is change, project, programme or transformation delivery a substantive output?", "Exclude generic change-ready language.")),
    workMix_productOwnership: noul(stateEvidence("Is product definition, roadmap, lifecycle or product outcome ownership a substantive responsibility?", "Product usage or advisory alone is not ownership.")),
    workMix_peopleLeadership: noul(stateEvidence("Is leading, managing or developing people a substantive responsibility?", "Require explicit evidence; generic employer values do not count.")),
    workMix_designResearch: noul(stateEvidence("Is design, user research or experience design a substantive output?", "Do not infer from product or technology work alone.")),
    ...Object.fromEntries(Object.keys(BUSINESS_PRODUCTS).filter(k => k !== "none").map(k => [`product_${k}`, noul(evidence(`Is \`${k}\` a repeated object of this role's decisions, sales, advice, analysis, operations or ownership?`, "No for employer industry, incidental mention or skills list."))])),
    ...Object.fromEntries(Object.keys(TECHNOLOGY_PLATFORMS).filter(k => k !== "none").map(k => [`platform_${k}`, noul(evidence(`Is \`${k}\` materially owned, engineered, operated or delivered by this role?`, "No for a programming language, tool, certification or incidental technology mention."))])),
    riskFlag1: choice("What is the most important material structural risk in the JD? Choose none unless a human reviewer could be materially misled.", STRUCTURAL_RISK_CODES),
    riskFlag2: choice("What is the second distinct material structural risk? Choose none unless distinct and material.", STRUCTURAL_RISK_CODES),
    riskSeverity1: choice("How severe is risk 1?", RISK_SEVERITIES), riskSeverity2: choice("How severe is risk 2?", RISK_SEVERITIES), riskSeverity3: choice("How severe is risk 3?", RISK_SEVERITIES),
  };
  if (providerUrl.includes("router.requesty.ai")) {
    return { url: providerUrl, model, payload: {
      model: model.includes("/") ? model : `typesafe/${model}`,
      messages: [{ role: "user", content: JSON.stringify({ ...input }) }],
      response_format: { type: "questions", questions: questionMap },
    } };
  }
  return { url: providerUrl, model, payload: {
    state: { jobId: input.jobId, title: input.title, company: input.company, location: input.location, ...(input.jevInput && Object.keys(input.jevInput).length ? (({ servedBusinessLineHint, operatingContextHint, ...structured }) => structured)(input.jevInput) : { description: input.description }) },
    model,
    questions: questionMap,
  } };
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch {
    const match = value.match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
  }
}

export function parseProviderResponse(providerResponse, input = {}) {
  const message = providerResponse?.choices?.[0]?.message;
  const raw = providerResponse?.answers || parseJson(message?.content ?? message?.tool_calls?.[0]?.function?.arguments ?? providerResponse);
  const root = raw.analysis || raw.result || raw.data || raw;
  const answerValue = (key, fallback) => {
    const answer = raw?.[key];
    if (!answer) return root?.[key] ?? fallback;
    if (answer.type === "choice") return answer.choice ?? answer.value ?? fallback;
    if (answer.type === "noul") { const score = typeof answer.noul === "number" ? answer.noul : answer.value; return typeof score === "number" ? (score >= 0.5 ? "yes" : "no") : fallback; }
    return answer.value ?? fallback;
  };
  const answerScore = key => { const answer = raw?.[key]; if (typeof answer?.noul === "number") return answer.noul; if (typeof answer?.value === "number") return answer.value; if (typeof answer?.confidence === "number" && (answer?.choice === "yes" || answer?.value === "yes")) return answer.confidence; return answerValue(key, "no") === "yes" ? 1 : 0; };
  const answerMeta = key => {
    const answer = raw?.[key];
    const confidence = typeof answer?.confidence === "number" ? answer.confidence : null;
    const probabilities = answer?.probabilities && typeof answer.probabilities === "object" ? answer.probabilities : null;
    const ranked = probabilities ? Object.entries(probabilities).filter(([, value]) => typeof value === "number").sort((a, b) => b[1] - a[1]) : [];
    const candidates = ranked.slice(0, 2).map(([value]) => value);
    const gap = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : null;
    const state = !answer ? "not_stated" : confidence !== null && confidence < 0.5 ? "low_confidence" : gap !== null && gap < 0.15 ? "conflicting" : "ok";
    return { confidence, probabilities, candidates, gap, state };
  };
  const allowed = (value, map, fallback) => Object.prototype.hasOwnProperty.call(map, value) ? value : fallback;
  const distinctChoices = (keys, map, excluded = []) => [...new Set(keys.map(key => answerValue(key, "none")))]
    .filter(value => value !== "none" && Object.prototype.hasOwnProperty.call(map, value) && !excluded.includes(value));
  const evidenceFlags = Array.isArray(input.jevInput?.evidence_flags) ? input.jevInput.evidence_flags : [];
  const legacyRisk = answerValue("riskFlag", root.riskFlags || root.riskFlag || "none");
  const roleRisks = distinctChoices(["riskFlag1", "riskFlag2"], STRUCTURAL_RISK_CODES)
    .filter(code => code !== "template_placeholder_text" || evidenceFlags.includes("template_placeholder_text"));
  if (!roleRisks.length && typeof legacyRisk === "string" && legacyRisk !== "none" && Object.prototype.hasOwnProperty.call(RISK_CODES, legacyRisk)) roleRisks.push(legacyRisk);
  const severityCap = { template_placeholder_text: "medium", responsibilities_generic_or_template: "medium", requirements_dominate_over_responsibilities: "medium", machine_translation_or_encoding_issues: "medium" };
  const severityRank = { low: 1, medium: 2, high: 3, unknown: 0 };
  const riskFlags = roleRisks.map((code, index) => {
    const requested = allowed(answerValue(`riskSeverity${index + 1}`, "medium"), RISK_SEVERITIES, "medium");
    const cap = severityCap[code];
    const severity = cap && severityRank[requested] > severityRank[cap] ? cap : requested;
    return { code, severity };
  });
  const qualityRiskCodes = ["template_placeholder_text", "responsibilities_generic_or_template", "requirements_dominate_over_responsibilities", "machine_translation_or_encoding_issues"];
  for (const code of qualityRiskCodes) if (evidenceFlags.includes(code) && !riskFlags.some(item => item.code === code)) riskFlags.push({ code, severity: "medium" });
  const postingType = answerValue("postingType", root.postingType || "specific_role");
  const archetypeRaw = answerValue("roleArchetype", root.roleArchetype || "insufficient_evidence");
  const normalizedArchetype = LEGACY_ARCHETYPE_MAP[archetypeRaw] || archetypeRaw;
  const evidenceInsufficient = input.jevInput?.evidence_level === "insufficient";
  const roleArchetype = postingType === "not_a_job_posting" ? "not_applicable" : (evidenceInsufficient ? "insufficient_evidence" : (Object.prototype.hasOwnProperty.call(ROLE_ARCHETYPES, normalizedArchetype) ? normalizedArchetype : "insufficient_evidence"));
  const mixKeys = { clientFacing: "client_relationships", revenueAccountability: "sales_origination", technicalDelivery: "technology_build", analysis: "research_analysis", controlAssurance: "risk_control", operationsProcessing: "operations_processing", changeDelivery: "strategy_transformation", productOwnership: "product_ownership", peopleLeadership: "people_leadership", designResearch: "experience_design" };
  const mixScores = Object.fromEntries(Object.entries(mixKeys).map(([key]) => [key, answerScore(`workMix_${key}`)]));
  const rankedMix = Object.entries(mixScores).filter(([,score]) => score >= 0.5).sort((a,b) => b[1]-a[1]);
  const peopleEvidence = answerScore("hasExplicitPeopleManagement") >= 0.5;
  const archetypeActivity = ARCHETYPE_PRIMARY_ACTIVITY[roleArchetype] || "other_unknown";
  const primaryActivity = answerScore("workMix_peopleLeadership") >= 0.8 && peopleEvidence ? "people_leadership" : (archetypeActivity !== "other_unknown" ? archetypeActivity : (rankedMix[0]?.[0] ? mixKeys[rankedMix[0][0]] : (root.primaryActivity || "other_unknown")));
  const secondaryActivities = rankedMix.slice(1).filter(([,score]) => score >= 0.65).slice(0, 2).map(([key]) => mixKeys[key]);
  const legacyBusinessDomain = answerValue("businessDomain", root.businessDomain || root.businessDomains?.[0] || "other_unknown");
  const servedBusinessLine = postingType === "not_a_job_posting" ? "not_applicable" : answerValue("servedBusinessLine", root.servedBusinessLine || "not_stated");
  const operatingContext = postingType === "not_a_job_posting" ? "not_applicable" : answerValue("operatingContext", root.operatingContext || "not_stated");
  const businessProductThreshold = ["TE", "CF"].includes(roleFamilyOf(roleArchetype)) ? 0.8 : 0.65;
  const platformThreshold = ["TE", "PS"].includes(roleFamilyOf(roleArchetype)) ? 0.65 : 0.8;
  const businessProducts = Object.keys(BUSINESS_PRODUCTS).filter(k => k !== "none").map(k => [k, answerScore(`product_${k}`)]).filter(([,score]) => score >= businessProductThreshold).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k);
  const technologyPlatforms = Object.keys(TECHNOLOGY_PLATFORMS).filter(k => k !== "none").map(k => [k, answerScore(`platform_${k}`)]).filter(([,score]) => score >= platformThreshold).sort((a,b) => b[1]-a[1]).map(([k]) => k);
  const productOrPlatformContext = [...businessProducts, ...technologyPlatforms];
  const titleSignals = input.title ? deriveTitleSignals(input.title, input.company) : (root.titleSignals || { market: "unknown", normalized: "unknown", tags: [], markers: [] });
  const titleLevelSignal = allowed(titleSignals.normalized || titleSignals.market || "unknown", TITLE_LEVELS, "unknown");
  const rawRoleLevel = answerValue("roleLevel", root.mandate?.roleLevel || root.roleLevel || answerValue("seniorityBand", root.seniorityBand || "unknown"));
  const roleLevel = allowed(rawRoleLevel === "unknown" && titleLevelSignal !== "unknown" ? titleLevelSignal : rawRoleLevel, ROLE_LEVELS, "unknown");
  const modelLeadership = answerValue("leadershipLevel", root.leadershipLevel || "not_stated");
  const teamEvidence = answerScore("hasExplicitTeamLeadership") >= 0.5;
  let leadershipLevel = postingType === "not_a_job_posting" ? "not_applicable" : modelLeadership === "informal_influencer" ? "informal_mentor_or_lead" : modelLeadership === "functional_leader" ? "manager_of_managers" : modelLeadership === "unknown" ? "not_stated" : modelLeadership;
  if ((leadershipLevel === "people_manager" || leadershipLevel === "manager_of_managers") && !peopleEvidence) leadershipLevel = teamEvidence ? "team_lead" : "individual_contributor";
  if (leadershipLevel === "not_stated" && input.jevInput?.evidence_level !== "thin" && input.jevInput?.evidence_level !== "insufficient") leadershipLevel = teamEvidence ? "team_lead" : "individual_contributor";
  if (leadershipLevel === "individual_contributor" && teamEvidence) leadershipLevel = "team_lead";
  const seniorityAlignment = titleSignals.tags?.includes("employer_band_convention") || titleSignals.tags?.includes("client_facing_title") ? "employer_title_convention" : (titleLevelSignal === roleLevel || titleLevelSignal === "unknown" ? "aligned" : "ambiguous");
  const confidence = Object.fromEntries(["roleArchetype", "servedBusinessLine", "operatingContext", "roleLevel", "mandateScope", "decisionAuthority", "leadershipLevel"].map(key => [key, answerMeta(key)]));
  const states = Object.fromEntries(Object.entries(confidence).map(([key, meta]) => [key, meta.state]));
  const candidates = Object.fromEntries(Object.entries(confidence).filter(([, meta]) => meta.candidates?.length).map(([key, meta]) => [key, meta.candidates]));
  const workMix = Object.fromEntries(["clientFacing", "revenueAccountability", "technicalDelivery", "analysis", "controlAssurance", "changeDelivery", "peopleLeadership", "designResearch"].map(key => [key, answerValue(`workMix_${key}`, "unknown")]));
  return {
    schemaVersion: 5,
    taxonomyVersion: TAXONOMY_VERSION,
    postingType,
    roleArchetype: allowed(roleArchetype, ROLE_ARCHETYPES, "insufficient_evidence"),
    roleFamily: roleFamilyOf(roleArchetype),
    roleFamilyLabel: ROLE_FAMILIES[roleFamilyOf(roleArchetype)] || "",
    roleArchetypeLabel: ROLE_ARCHETYPE_LABELS[roleArchetype] || ROLE_ARCHETYPE_LABELS.insufficient_evidence,
    workProfile: { primaryActivity: allowed(primaryActivity, ACTIVITIES, "other_unknown"), secondaryActivities, workMix },
    businessContext: { businessDomain: "other_unknown", servedBusinessLine: allowed(servedBusinessLine, { ...SERVED_BUSINESS_LINES, multi_line: "Multiple business lines.", not_stated: "Not stated.", not_applicable: "Not applicable." }, "not_stated"), operatingContext: allowed(operatingContext, { ...OPERATING_CONTEXTS, not_applicable: "Not applicable." }, "not_stated"), businessProducts, technologyPlatforms, productOrPlatformContext },
    mandate: {
      roleLevel: allowed(roleLevel, ROLE_LEVELS, "unknown"),
      titleLevelSignal,
      titleConventionTags: titleSignals.tags || [],
      seniorityAlignment,
      mandateScope: allowed(answerValue("mandateScope", root.mandateScope || root.responsibilityLevel || "unknown"), MANDATE_SCOPES, "unknown"),
      decisionAuthority: allowed(answerValue("decisionAuthority", root.decisionAuthority || "not_stated"), { ...DECISION_AUTHORITIES, not_stated: "Not stated." }, "not_stated"),
    },
    leadershipLevel: allowed(leadershipLevel, { ...LEADERSHIP_LEVELS, not_stated: "Not stated.", not_applicable: "Not applicable." }, "not_stated"),
    roleRisk: { riskFlags },
    // Compatibility aliases for older cached clients.
    function: answerValue("function", root.function || "unknown"),
    subFunctions: Array.isArray(root.subFunctions) ? root.subFunctions : (root.subFunctions ? [root.subFunctions] : []),
    businessDomains: [legacyBusinessDomain],
    seniorityBand: allowed(roleLevel, ROLE_LEVELS, "unknown"),
    responsibilityLevel: answerValue("responsibilityLevel", root.responsibilityLevel || "unknown"),
    riskFlags,
    confidence,
    states,
    candidates,
    evidence: input.jevInput ? { level: input.jevInput.evidence_level || "unknown", flags: evidenceFlags } : { level: "unknown", flags: [] },
  };
}

async function callProvider(input, env) {
  const apiKey = env.JEV_API_KEY || env.TYPESAFE_API_KEY || env.REQUESTY_API_KEY;
  if (!apiKey) throw Object.assign(new Error("provider_not_configured"), { status: 503 });
  const request = buildProviderRequest(input, env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error("JEV provider error", response.status, bodyText.slice(0, 500));
      throw Object.assign(new Error("provider_error"), { status: response.status === 429 || response.status === 529 ? response.status : 502 });
    }
    return parseProviderResponse(JSON.parse(bodyText), input);
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("provider_timeout"), { status: 504 });
    throw error;
  } finally { clearTimeout(timer); }
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function checkRateLimit(request) {
  const key = request.headers.get("CF-Connecting-IP") || "anonymous";
  const now = Date.now();
  const existing = recentRequests.get(key) || { started: now, count: 0 };
  if (now - existing.started >= RATE_WINDOW_MS) { existing.started = now; existing.count = 0; }
  existing.count += 1; recentRequests.set(key, existing);
  if (recentRequests.size > 500) for (const [k, v] of recentRequests) if (now - v.started > RATE_WINDOW_MS) recentRequests.delete(k);
  return existing.count <= RATE_LIMIT;
}

async function handleJev(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSON_HEADERS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, { allow: "POST, OPTIONS" });
  if (!allowedOrigin(request)) return jsonResponse(403, { error: "origin_not_allowed" });
  if (!checkRateLimit(request)) return jsonResponse(429, { error: "rate_limited" }, { "retry-after": "60" });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return jsonResponse(413, { error: "request_too_large" });
  let input;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return jsonResponse(413, { error: "request_too_large" });
    input = validateRequest(JSON.parse(body));
  } catch (error) {
    const status = error.message === "description_required" ? 422 : 400;
    return jsonResponse(status, { error: error.message || "invalid_request" });
  }
  try { return jsonResponse(200, { schemaVersion: 5, analysis: await callProvider(input, env) }); }
  catch (error) { return jsonResponse(error.status || 502, { error: error.message || "analysis_failed" }); }
}

async function serveFreshIndex(request, env) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/") return env.ASSETS.fetch(request);
  // The repository is private, so raw.githubusercontent.com cannot be a
  // reliable runtime origin. Use the asset version that this deployment
  // actually published, then prevent the HTML shell from being retained at
  // the edge or by a browser between deployments.
  const asset = await env.ASSETS.fetch(request);
  const source = await asset.text();
  const headers = new Headers(asset.headers);
  headers.set("cache-control", "no-store, no-cache, must-revalidate");
  headers.set("x-content-type-options", "nosniff");
  const html = source.replace(/app\.js\?v=jev-analysis-3/g, "app.js?v=legacy-jd-bridge-3");
  return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
}

const worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/jev/analyze") return handleJev(request, env);
    return serveFreshIndex(request, env);
  },
};
export default worker_default;
export const __test = { handleJev, questions, DEFAULT_PROVIDER_URL, DEFAULT_MODEL };
