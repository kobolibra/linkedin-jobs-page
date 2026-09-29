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
const TAXONOMY_VERSION = "jev-taxonomy-v3.0";

const ROLE_FAMILIES = {
  CS: "Client & Commercial", IR: "Investment, Markets & Research", RC: "Risk, Compliance & Assurance",
  OP: "Operations & Service", PS: "Product, Strategy & Transformation", TE: "Technology & Engineering",
  CF: "Corporate & Finance",
};
const ROLE_ARCHETYPE_LABELS = {
  CS1: "Relationship Management & Coverage", CS2: "Sales & Origination", CS3: "Product Sales & Advisory", CS4: "Customer Service & Acquisition", CS5: "Investment Banking Advisory", CS6: "Markets Sales & Distribution",
  IR1: "Investment Research & Strategy", IR2: "Portfolio Management & Asset Allocation", IR3: "Credit Underwriting",
  RC1: "Enterprise & Operational Risk", RC2: "Financial Crime, KYC & AML", RC3: "Compliance & Regulatory Affairs", RC4: "Internal Audit & Assurance",
  OP1: "Operations, Settlement & Servicing", OP2: "Securities Services & Fund Administration", OP3: "Service Delivery & Processing",
  PS1: "Product Management & Governance", PS2: "Business Analysis & Delivery", PS3: "Strategy & Transformation", PS4: "Technology Architecture & Delivery",
  TE1: "Software Application Engineering", TE2: "Platform, Cloud & Reliability Engineering", TE3: "Cybersecurity", TE4: "Technology Architecture", TE5: "Data Engineering & Analytics", TE6: "AI, Quantitative & Advanced Analytics",
  CF1: "Finance, Accounting & Treasury", CF2: "People & Human Resources", CF3: "Marketing & Communications", CF4: "Legal & Corporate Affairs", CF5: "Procurement & Vendor Management", CF6: "Corporate Services",
  other_profession: "Other Clear Profession", insufficient_evidence: "Insufficient Evidence", not_applicable: "Not Applicable",
};
const ROLE_ARCHETYPES = {
  CS1: "Owns an ongoing client, account or relationship portfolio and its coverage outcomes. NOT pure acquisition without an owned book (CS2) or product specialist support without relationship ownership (CS3).",
  CS2: "Acquires, originates or distributes business and revenue through sales or business development. NOT ongoing account coverage (CS1) or product advice without origination ownership (CS3).",
  CS3: "Provides specialist product expertise, solution advice or product sales support. NOT product lifecycle ownership (PS1) or a relationship portfolio owner (CS1).",
  CS4: "Performs frontline customer service, contact-centre, branch or customer acquisition work. NOT specialist relationship coverage or enterprise service operations.",
  CS5: "Performs corporate finance, M&A, ECM, DCM, underwriting or investment-banking advisory. NOT generic strategy or markets trading.",
  CS6: "Sells, distributes, structures or executes market products for market-facing clients. NOT portfolio management or investment research.",
  IR1: "Produces investment, market, economic or sector research and recommendations. NOT execution-only trading or portfolio ownership.",
  IR2: "Owns or makes portfolio, asset-allocation or investment mandate decisions. NOT research-only or product advisory.",
  IR3: "Assesses borrowers, underwrites credit, monitors credit exposure or owns first-line credit decisions. NOT second-line enterprise risk.",
  RC1: "Performs enterprise, operational, model or market risk management and control oversight. NOT transaction-level credit underwriting (IR3) or compliance advisory (RC3).",
  RC2: "Performs KYC, CDD, AML, sanctions, fraud or financial-crime investigations and controls. NOT general regulatory compliance.",
  RC3: "Performs regulatory compliance, policy, monitoring, advisory or regulatory affairs. NOT financial-crime investigation as the dominant output (RC2).",
  RC4: "Performs independent internal audit, assurance testing or audit reporting. NOT first/second-line risk or compliance control ownership.",
  OP1: "Performs transaction processing, settlement, clearing, middle-office or operational servicing. NOT independent audit or client relationship ownership.",
  OP2: "Performs custody, fund accounting, transfer agency or securities-services administration. NOT generic transaction operations without securities-services specialization.",
  OP3: "Owns service delivery, case handling, administrative processing or operational support outcomes. NOT frontline customer acquisition (CS4).",
  PS1: "Owns product definition, roadmap, lifecycle, governance or product outcomes. NOT product sales/advisory without lifecycle ownership (CS3).",
  PS2: "Performs business analysis, project, PMO, delivery or requirements work for a defined change or technology outcome. NOT hands-on software engineering as the dominant output.",
  PS3: "Drives enterprise strategy, transformation, change or programme execution. NOT a single project coordinator without transformation mandate.",
  PS4: "Owns technical solution design, architecture or technology delivery governance. NOT hands-on application/platform engineering as the dominant output.",
  TE1: "Builds, tests, deploys and maintains business applications or software systems. NOT platform operations, data-specialist or architecture governance as the dominant output.",
  TE2: "Builds or operates cloud, infrastructure, SRE, platform or production reliability capabilities. NOT application feature engineering alone.",
  TE3: "Owns cybersecurity engineering, security operations, architecture, threat or security assurance. NOT generic technology risk or compliance.",
  TE4: "Owns technical architecture, standards and cross-system design. NOT delivery coordination without technical design ownership.",
  TE5: "Performs data engineering, data platforms, BI or production analytics. NOT advanced AI/quantitative modelling as the dominant output (TE6).",
  TE6: "Performs AI/ML, quantitative modelling, statistical science or advanced analytics as a primary output. NOT ordinary reporting or data engineering alone.",
  CF1: "Performs accounting, financial control, treasury, tax, FP&A or actuarial-finance work.",
  CF2: "Performs HR, recruitment, talent, reward or people operations work.",
  CF3: "Performs marketing, communications, brand, content or customer communications work.",
  CF4: "Performs legal, company secretarial, corporate affairs or legal advisory work.",
  CF5: "Performs procurement, sourcing, vendor management or third-party commercial governance.",
  CF6: "Performs corporate services outside the controlled professional families, such as workplace, administration or facilities services.",
  other_profession: "A clear profession outside this controlled taxonomy. Do not use when evidence is merely thin.",
  insufficient_evidence: "Core responsibilities are too thin, generic or contradictory to classify.",
  not_applicable: "Not a substantive single job posting or evidence is not applicable.",
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
function roleFamilyOf(value) { return String(value || "").match(/^(CS|IR|RC|OP|PS|TE|CF)/)?.[1] || null; }
const LEGACY_ARCHETYPE_MAP = { client_relationship_coverage: "CS1", direct_sales_origination: "CS2", product_sales_advisory: "CS3", customer_service_frontline: "CS4", investment_research_strategy: "IR1", portfolio_management: "IR2", markets_sales_trading: "CS6", investment_banking_advisory: "CS5", credit_underwriting: "IR3", financial_crime_kyc_aml: "RC2", compliance_regulatory: "RC3", enterprise_risk: "RC1", internal_audit: "RC4", operations_settlement_servicing: "OP1", securities_services_fund_admin: "OP2", product_management_governance: "PS1", software_application_engineering: "TE1", platform_cloud_reliability_engineering: "TE2", cybersecurity: "TE3", technology_architecture: "TE4", data_ai_quantitative_analytics: "TE5", business_analysis_delivery: "PS2", strategy_transformation: "PS3", finance_accounting_treasury_control: "CF1", people_marketing_corporate_services: "CF6" };


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
const SERVED_BUSINESS_LINES = { personal_retail: "Personal or retail banking.", wealth_premier: "Premier or retail wealth.", private_banking: "Private banking.", commercial_business: "Commercial banking.", corporate_institutional: "Corporate or institutional banking.", transaction_banking_payments_trade: "Transaction banking, payments or trade.", securities_services: "Securities services and fund administration.", global_markets: "Global markets.", investment_banking_advisory: "Investment banking and advisory.", asset_management_funds: "Asset management and funds.", insurance: "Insurance.", group_functions_enterprise: "Group or enterprise functions.", multi_line: "Multiple explicitly served business lines.", multi_line_unspecified: "Multiple lines or not specified.", not_stated: "Not stated." };
const OPERATING_CONTEXTS = { onshore_bank_business_unit: "Onshore bank business unit.", shared_service_centre: "Shared service or operations centre.", technology_development_centre: "Technology development centre.", securities_or_ib_jv: "Securities or investment-banking joint venture.", asset_management_or_wealth_entity: "Asset-management or wealth entity.", insurance_entity: "Insurance entity.", consumer_finance_or_other: "Consumer finance or other entity.", not_stated: "Not stated." };
const RISK_CODES = { none: "No material structural risk.", title_scope_mismatch: "Title and actual responsibilities materially differ.", seniority_ambiguity: "Seniority signals are ambiguous or inconsistent.", responsibility_ambiguity: "Mandate, ownership boundary or outcomes are unclear.", leadership_ambiguity: "IC, team-lead and people-management signals conflict.", function_context_mismatch: "Title, function and business context point to different role types.", contradictory_scope: "Narrow execution and broad ownership are combined without explanation.", title_inflation_by_convention: "Employer title convention overstates market level.", multiple_roles_in_one_jd: "Multiple distinct roles or locations are combined.", range_level_posting: "Title covers a hiring range rather than one level.", bilingual_content_conflict: "Bilingual versions contain different role evidence.", vendor_or_outsourced_ambiguity: "Employment or accountability boundary appears outsourced.", location_or_entity_ambiguity: "Location, legal entity or operating context is ambiguous.", requirements_dominate_over_responsibilities: "Requirements dominate while role responsibilities are thin.", template_placeholder_text: "The JD contains unresolved placeholders.", machine_translation_or_encoding_issues: "Likely translation or encoding defects.", responsibilities_generic_or_template: "Responsibilities are dominated by generic/template language." };
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
    riskFlag1: choice("What is the most important material structural risk in the JD? Choose none unless a human reviewer could be materially misled.", RISK_CODES),
    riskFlag2: choice("What is the second distinct material structural risk? Choose none unless distinct and material.", RISK_CODES),
    riskFlag3: choice("What is the third distinct material structural risk? Choose none unless distinct and material.", RISK_CODES),
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
    state: { jobId: input.jobId, title: input.title, company: input.company, location: input.location, description: input.description, ...(input.jevInput || {}) },
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
    if (answer.type === "noul") return answer.value >= 0.5 ? "yes" : "no";
    return answer.value ?? fallback;
  };
  const answerScore = key => { const answer = raw?.[key]; if (typeof answer?.value === "number") return answer.value; if (typeof answer?.confidence === "number" && (answer?.choice === "yes" || answer?.value === "yes")) return answer.confidence; return answerValue(key, "no") === "yes" ? 1 : 0; };
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
  const roleRisks = distinctChoices(["riskFlag1", "riskFlag2", "riskFlag3"], RISK_CODES)
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
  const postingType = answerValue("postingType", root.postingType || "specific_role");
  const archetypeRaw = answerValue("roleArchetype", root.roleArchetype || "insufficient_evidence");
  const normalizedArchetype = LEGACY_ARCHETYPE_MAP[archetypeRaw] || archetypeRaw;
  const roleArchetype = postingType === "not_a_job_posting" ? "not_applicable" : (Object.prototype.hasOwnProperty.call(ROLE_ARCHETYPES, normalizedArchetype) ? normalizedArchetype : "insufficient_evidence");
  const mixKeys = { clientFacing: "client_relationships", revenueAccountability: "sales_origination", technicalDelivery: "technology_build", analysis: "research_analysis", controlAssurance: "risk_control", operationsProcessing: "operations_processing", changeDelivery: "strategy_transformation", productOwnership: "product_ownership", peopleLeadership: "people_leadership", designResearch: "experience_design" };
  const mixScores = Object.fromEntries(Object.entries(mixKeys).map(([key]) => [key, answerScore(`workMix_${key}`)]));
  const rankedMix = Object.entries(mixScores).filter(([,score]) => score >= 0.5).sort((a,b) => b[1]-a[1]);
  const primaryActivity = rankedMix[0]?.[0] ? mixKeys[rankedMix[0][0]] : (root.primaryActivity || "other_unknown");
  const secondaryActivities = rankedMix.slice(1).filter(([,score]) => score >= 0.65).slice(0, 2).map(([key]) => mixKeys[key]);
  const legacyBusinessDomain = answerValue("businessDomain", root.businessDomain || root.businessDomains?.[0] || "other_unknown");
  const servedBusinessLine = input.jevInput?.servedBusinessLineHint || answerValue("servedBusinessLine", root.servedBusinessLine || "not_stated");
  const operatingContext = input.jevInput?.operatingContextHint || answerValue("operatingContext", root.operatingContext || "not_stated");
  const businessProducts = Object.keys(BUSINESS_PRODUCTS).filter(k => k !== "none").map(k => [k, answerScore(`product_${k}`)]).filter(([,score]) => score >= 0.65).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k);
  const technologyPlatforms = Object.keys(TECHNOLOGY_PLATFORMS).filter(k => k !== "none").map(k => [k, answerScore(`platform_${k}`)]).filter(([,score]) => score >= 0.65).sort((a,b) => b[1]-a[1]).map(([k]) => k);
  const productOrPlatformContext = [...businessProducts, ...technologyPlatforms];
  const titleSignals = input.title ? deriveTitleSignals(input.title, input.company) : (root.titleSignals || { market: "unknown", normalized: "unknown", tags: [], markers: [] });
  const titleLevelSignal = allowed(titleSignals.normalized || titleSignals.market || "unknown", TITLE_LEVELS, "unknown");
  const rawRoleLevel = answerValue("roleLevel", root.mandate?.roleLevel || root.roleLevel || answerValue("seniorityBand", root.seniorityBand || "unknown"));
  const roleLevel = allowed(rawRoleLevel === "unknown" && titleLevelSignal !== "unknown" ? titleLevelSignal : rawRoleLevel, ROLE_LEVELS, "unknown");
  const modelLeadership = answerValue("leadershipLevel", root.leadershipLevel || "not_stated");
  const peopleEvidence = answerScore("hasExplicitPeopleManagement") >= 0.5;
  const teamEvidence = answerScore("hasExplicitTeamLeadership") >= 0.5;
  let leadershipLevel = modelLeadership === "informal_influencer" ? "informal_mentor_or_lead" : modelLeadership === "functional_leader" ? "manager_of_managers" : modelLeadership === "unknown" ? "not_stated" : modelLeadership;
  if ((leadershipLevel === "people_manager" || leadershipLevel === "manager_of_managers") && !peopleEvidence) leadershipLevel = teamEvidence ? "team_lead" : "individual_contributor";
  if (leadershipLevel === "not_stated" && input.jevInput?.evidence_level !== "thin" && input.jevInput?.evidence_level !== "insufficient") leadershipLevel = teamEvidence ? "team_lead" : "individual_contributor";
  if (leadershipLevel === "individual_contributor" && teamEvidence) leadershipLevel = "team_lead";
  const seniorityAlignment = titleSignals.tags?.includes("employer_band_convention") || titleSignals.tags?.includes("client_facing_title") ? "employer_title_convention" : (titleLevelSignal === roleLevel || titleLevelSignal === "unknown" ? "aligned" : "ambiguous");
  const confidence = Object.fromEntries(["roleArchetype", "servedBusinessLine", "operatingContext", "roleLevel", "mandateScope", "decisionAuthority", "leadershipLevel"].map(key => [key, answerMeta(key)]));
  const states = Object.fromEntries(Object.entries(confidence).map(([key, meta]) => [key, meta.state]));
  const candidates = Object.fromEntries(Object.entries(confidence).filter(([, meta]) => meta.candidates?.length).map(([key, meta]) => [key, meta.candidates]));
  const workMix = Object.fromEntries(["clientFacing", "revenueAccountability", "technicalDelivery", "analysis", "controlAssurance", "changeDelivery", "peopleLeadership", "designResearch"].map(key => [key, answerValue(`workMix_${key}`, "unknown")]));
  return {
    schemaVersion: 4,
    taxonomyVersion: TAXONOMY_VERSION,
    postingType,
    roleArchetype: allowed(roleArchetype, ROLE_ARCHETYPES, "insufficient_evidence"),
    roleFamily: roleFamilyOf(roleArchetype),
    roleFamilyLabel: ROLE_FAMILIES[roleFamilyOf(roleArchetype)] || "",
    roleArchetypeLabel: ROLE_ARCHETYPE_LABELS[roleArchetype] || ROLE_ARCHETYPE_LABELS.insufficient_evidence,
    workProfile: { primaryActivity: allowed(primaryActivity, ACTIVITIES, "other_unknown"), secondaryActivities, workMix },
    businessContext: { businessDomain: "other_unknown", servedBusinessLine: allowed(servedBusinessLine, { ...SERVED_BUSINESS_LINES, multi_line: "Multiple business lines.", not_stated: "Not stated." }, "not_stated"), operatingContext: allowed(operatingContext, OPERATING_CONTEXTS, "not_stated"), businessProducts, technologyPlatforms, productOrPlatformContext },
    mandate: {
      roleLevel: allowed(roleLevel, ROLE_LEVELS, "unknown"),
      titleLevelSignal,
      titleConventionTags: titleSignals.tags || [],
      seniorityAlignment,
      mandateScope: allowed(answerValue("mandateScope", root.mandateScope || root.responsibilityLevel || "unknown"), MANDATE_SCOPES, "unknown"),
      decisionAuthority: allowed(answerValue("decisionAuthority", root.decisionAuthority || "not_stated"), { ...DECISION_AUTHORITIES, not_stated: "Not stated." }, "not_stated"),
    },
    leadershipLevel: allowed(leadershipLevel, { ...LEADERSHIP_LEVELS, not_stated: "Not stated." }, "not_stated"),
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
  try { return jsonResponse(200, { schemaVersion: 4, analysis: await callProvider(input, env) }); }
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
