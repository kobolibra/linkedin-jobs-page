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
const TAXONOMY_VERSION = "jev-taxonomy-v2.3";

const ROLE_ARCHETYPES = {
  client_relationship_coverage: "Owns client relationships, account coverage or relationship portfolios.",
  direct_sales_origination: "Acquires clients or originates revenue through direct sales and business development.",
  product_sales_advisory: "Provides product expertise, product sales or specialist advisory without owning the product lifecycle.",
  customer_service_frontline: "Performs customer service, contact-centre, branch or frontline acquisition work.",
  investment_research_strategy: "Produces investment, market, economic or sector research and strategy.",
  portfolio_management: "Makes or owns portfolio-management, asset-allocation or investment decisions.",
  markets_sales_trading: "Works in markets sales, trading, structuring or market execution.",
  investment_banking_advisory: "Performs corporate finance, M&A, ECM, DCM or investment-banking advisory/underwriting.",
  credit_underwriting: "Performs credit assessment, underwriting, credit monitoring or first-line credit risk.",
  financial_crime_kyc_aml: "Performs KYC, CDD, AML, sanctions, fraud or financial-crime investigations and controls.",
  compliance_regulatory: "Performs regulatory compliance, policy, advisory, monitoring or regulatory affairs.",
  enterprise_risk: "Performs enterprise, operational, model, market or second-line risk management.",
  internal_audit: "Performs independent internal audit and assurance.",
  operations_settlement_servicing: "Performs transaction processing, settlement, middle-office or servicing operations.",
  securities_services_fund_admin: "Performs custody, fund accounting, transfer agency or securities-services administration.",
  product_management_governance: "Owns product definition, lifecycle, governance or product outcomes.",
  software_application_engineering: "Builds and maintains business applications or software systems.",
  platform_cloud_reliability_engineering: "Builds platforms, cloud, infrastructure, SRE or production reliability capabilities.",
  cybersecurity: "Owns cyber security engineering, operations, architecture or security assurance.",
  technology_architecture: "Owns solution architecture, technical standards or technical design.",
  data_ai_quantitative_analytics: "Performs data engineering, AI/ML, quantitative analysis or advanced analytics.",
  business_analysis_delivery: "Performs business analysis, project, PMO or delivery management.",
  strategy_transformation: "Drives enterprise strategy, transformation, change or programme execution.",
  finance_accounting_treasury_control: "Performs accounting, financial control, treasury, FP&A or actuarial-finance work.",
  people_marketing_corporate_services: "Performs HR, recruitment, marketing or corporate-services work.",
  other_profession: "A clear profession that is outside the controlled taxonomy.",
  insufficient_evidence: "The role evidence is too thin, generic or contradictory to classify.",
};

const ACTIVITIES = {
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
  none: "The JD does not materially assign the role to a business product.", deposits: "Deposits or deposit products.", mortgages: "Mortgages or home lending.", credit_cards: "Credit cards.", consumer_lending: "Consumer lending.", corporate_lending: "Corporate or commercial lending.", cash_management: "Cash management or transaction banking.", trade_finance: "Trade finance.", payments: "Payments.", foreign_exchange: "Foreign exchange or FX.", fixed_income: "Fixed income.", credit_products: "Credit products.", equities: "Equities.", derivatives: "Derivatives.", investment_funds: "Investment funds.", structured_products: "Structured products.", insurance_products: "Insurance products.", wealth_management: "Wealth management.", private_banking: "Private banking.", portfolio_management: "Portfolio management.", asset_allocation: "Asset allocation.", mutual_funds: "Mutual funds.", unit_trusts: "Unit trusts.", private_markets: "Private markets.",
};
const TECHNOLOGY_PLATFORMS = {
  none: "The JD does not materially assign the role to a technology platform.", business_applications: "Business applications owned or delivered by the role.", apis_and_microservices: "APIs, microservices or API platform owned or delivered by the role.", cloud_platforms: "Cloud platforms operated, engineered or owned by the role.", platform_infrastructure: "Infrastructure platforms, networks or shared technical foundations.", data_platforms: "Data platforms, warehouses, lakes or data delivery foundations.", ai_ml_platforms: "AI/ML platforms or model-serving foundations.", reliability_observability: "Reliability, observability or production operations platforms.", trading_systems: "Trading, order-management or market systems.",
};
const TITLE_LEVELS = { entry: "Entry / early-career title signal.", professional: "Professional title signal without a clear senior marker.", senior_individual_contributor: "Senior, staff, principal or equivalent IC title signal.", manager_or_lead: "Manager, lead or equivalent team-lead title signal.", director_or_head: "Director, head or equivalent senior leadership title signal.", executive: "Executive, managing director, business head or C-suite title signal.", unknown: "The title does not provide a reliable level signal." };
const SENIORITY_ALIGNMENT = { aligned: "Title level and JD responsibility are materially aligned.", title_higher_than_scope: "Title signals a higher level than the responsibility supported by the JD.", title_lower_than_scope: "JD responsibility signals a higher level than the title.", ambiguous: "Title and JD contain materially conflicting or insufficient level evidence." };

const RISK_CODES = {
  none: "No material structural risk is evident in the JD.", title_scope_mismatch: "The title and actual responsibilities materially differ.", seniority_ambiguity: "The seniority signals are ambiguous or internally inconsistent.", responsibility_ambiguity: "The mandate, ownership boundary or expected outcomes are materially unclear.", leadership_ambiguity: "The JD mixes IC, team-lead and people-management signals.", function_context_mismatch: "The title, function and business context point to different role types.", contradictory_scope: "The JD combines narrow execution and broad ownership without explaining the relationship.", responsibilities_generic_or_template: "Role evidence is dominated by employer boilerplate or generic language.", title_inflation_by_convention: "Employer title convention makes the market title overstate role level.", multiple_roles_in_one_jd: "The posting combines multiple distinct roles or locations.", range_level_posting: "The title covers a hiring range rather than one level.", bilingual_content_conflict: "The bilingual versions contain materially different role evidence.", vendor_or_outsourced_ambiguity: "Employment or accountability boundary appears outsourced or vendor-based.", location_or_entity_ambiguity: "Location, legal entity or operating context is materially ambiguous.", requirements_dominate_over_responsibilities: "Requirements dominate while actual role responsibilities are thin.", template_placeholder_text: "The JD contains unresolved placeholders.", machine_translation_or_encoding_issues: "The JD contains likely translation or encoding defects.", leadership_signals_conflict: "Model leadership output conflicts with observable text evidence.",
};
const RISK_SEVERITIES = { low: "Limited structural concern.", medium: "Material concern for comparison or interpretation.", high: "Significant concern likely to mislead a reviewer.", unknown: "Severity cannot be determined." };

const ROLE_LEVELS = { entry: "Intern, graduate, trainee, assistant or entry-level role.", professional: "Analyst, associate, consultant or established professional role.", senior_individual_contributor: "Senior or experienced individual contributor without clear people-management responsibility.", manager_or_lead: "Manager, senior manager, lead, principal or team lead.", director_or_head: "Director, associate director, head of a function or equivalent senior leader.", executive: "C-suite, country head, business head, managing director or executive leader.", unknown: "The role level cannot be determined from the description." };
const BUSINESS_DOMAINS = { retail_banking: "Retail or consumer banking.", commercial_corporate_banking: "Commercial, corporate or wholesale banking.", wealth_private_banking: "Wealth management or private banking.", capital_markets: "Capital markets, securities, trading or investment banking.", asset_management: "Asset management, funds or institutional investing.", insurance: "Insurance or reinsurance.", fintech_payments: "Fintech, payments or financial infrastructure.", technology_services: "Technology or software services as the primary business context.", corporate_enterprise: "Enterprise corporate or shared-services context.", other_unknown: "Another context or insufficient evidence." };
const SERVED_BUSINESS_LINES = { personal_retail: "Personal or retail banking.", wealth_premier: "Premier or retail wealth.", private_banking: "Private banking.", commercial_business: "Commercial banking.", corporate_institutional: "Corporate or institutional banking.", transaction_banking_payments_trade: "Transaction banking, payments or trade.", securities_services: "Securities services and fund administration.", global_markets: "Global markets.", investment_banking_advisory: "Investment banking and advisory.", asset_management_funds: "Asset management and funds.", insurance: "Insurance.", group_functions_enterprise: "Group or enterprise functions.", multi_line_unspecified: "Multiple lines or not specified." };
const OPERATING_CONTEXTS = { onshore_bank_business_unit: "Onshore bank business unit.", shared_service_centre: "Shared service or operations centre.", technology_development_centre: "Technology development centre.", securities_or_ib_jv: "Securities or investment-banking joint venture.", asset_management_or_wealth_entity: "Asset-management or wealth entity.", insurance_entity: "Insurance entity.", consumer_finance_or_other: "Consumer finance or other entity.", not_stated: "Not stated." };
const FIELD_STATES = { ok: "Evidence supports the value.", low_confidence: "A value exists but confidence is low.", not_stated: "The JD does not state this dimension.", not_applicable: "The dimension is not applicable to this role.", conflicting: "Evidence materially conflicts." };

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
const MANDATE_SCOPES = { individual_delivery: "Primarily owns individual delivery.", workstream_or_project: "Owns a defined workstream, project, book of work or specialist area.", team_or_function: "Owns a team, function or major programme mandate.", business_unit_or_region: "Owns a business unit, country, region or material commercial mandate.", enterprise: "Owns an enterprise-wide or group-level mandate.", unknown: "Insufficient evidence." };
const DECISION_AUTHORITIES = { execution: "Executes defined work without explicit decision ownership.", recommendation: "Provides recommendations, analysis or advice without final authority.", approval: "Has explicit approval, authorization or sign-off authority.", ownership: "Owns a business outcome, mandate or material decision domain.", unknown: "Insufficient evidence." };
const LEADERSHIP_LEVELS = { individual_contributor: "Individual contributor with no explicit leadership ownership.", informal_influencer: "Mentors, coordinates or influences without owning a team.", team_lead: "Leads a squad, project team or workstream without clear formal people management.", people_manager: "Explicitly manages people, hiring or performance.", functional_leader: "Owns a function or multiple teams.", unknown: "Insufficient evidence." };

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
  const evidence = (question, rules) => ({ title: input.title || "", description: input.description || "", company: input.company || "", location: input.location || "", question, rules });
  const stateEvidence = (question, rules) => ({ title: input.title || "", role_summary: input.jevInput?.role_summary || "", responsibilities: input.jevInput?.responsibilities || input.description || "", requirements: input.jevInput?.requirements || "", employer_metadata: input.jevInput?.employer_metadata || "", question, rules });
  const questionMap = {
    postingType: choice(stateEvidence("What kind of posting is this?", "Choose specific_role for one concrete job, programme_intake for internship/graduate/rotational intake, talent_pool_or_evergreen for a general talent pool, multiple_distinct_roles when materially different roles are combined, or not_a_job_posting when this is not a job description."), { specific_role: "One concrete role.", programme_intake: "Programme or intake.", talent_pool_or_evergreen: "Talent pool or evergreen posting.", multiple_distinct_roles: "Multiple distinct roles.", not_a_job_posting: "Not a job posting." }),
    roleArchetype: choice(stateEvidence("What single controlled role archetype best describes the profession being hired? Use ownership, recurring responsibilities and outputs; ignore requirements and employer boilerplate.", "If core responsibilities are insufficient, choose insufficient_evidence. Choose other_profession only when a clear profession is outside the enum."), ROLE_ARCHETYPES),
    primaryActivity: choice("What is the single dominant work activity of this role? Rank explicit ownership, recurring responsibilities and outputs above supporting language.", ACTIVITIES),
    secondaryActivity1: choice("What is the most important secondary activity, if any? Do not repeat the primary activity.", ACTIVITIES),
    secondaryActivity2: choice("What is the second most important secondary activity, if any? Do not repeat the primary activity or the first secondary activity.", ACTIVITIES),
    servedBusinessLine: choice(stateEvidence("Which business line does this role serve? For technology, operations, risk and finance roles, classify the business served rather than the employee function.", "Use explicit business metadata and recurring role responsibilities; do not infer technology_services merely because the role is technical."), SERVED_BUSINESS_LINES),
    operatingContext: choice(stateEvidence("What operating context or entity is this role in?", "Distinguish an onshore business unit from shared services, technology centre, joint venture and other entities."), OPERATING_CONTEXTS),
    businessDomain: choice(stateEvidence("What single business context does this role operate in? Distinguish business context from professional function.", "Use role_summary and responsibilities, not requirements or benefits."), {
      retail_banking: "Retail or consumer banking.", commercial_corporate_banking: "Commercial, corporate or wholesale banking.", wealth_private_banking: "Wealth management or private banking.", capital_markets: "Capital markets, securities, trading or investment banking.", asset_management: "Asset management, funds or institutional investing.", insurance: "Insurance or reinsurance.", fintech_payments: "Fintech, payments or financial infrastructure.", technology_services: "Technology or software services as the primary business context.", corporate_enterprise: "Enterprise corporate or shared-services context.", other_unknown: "Another context or insufficient evidence.",
    }),
    businessProduct1: choice(evidence("Which single business product is materially worked on by this role? Choose none when the JD only names the employer's industry or mentions a product incidentally.", "Select only products that are recurring objects of the role's decisions, analysis, sales, operations or ownership."), BUSINESS_PRODUCTS),
    businessProduct2: choice(evidence("Which second business product, if any, is materially worked on by this role? Do not repeat the first choice.", "Choose none for incidental mentions, generic financial-services context or skills."), BUSINESS_PRODUCTS),
    technologyPlatform1: choice(evidence("Which single technology platform context is materially owned, engineered, operated or delivered by this role? Choose none when technologies are merely skills or tools.", "A programming language, vendor certification or ordinary software usage is not a platform context."), TECHNOLOGY_PLATFORMS),
    technologyPlatform2: choice(evidence("Which second technology platform context, if any, is materially owned, engineered, operated or delivered by this role? Do not repeat the first choice.", "Choose none for incidental technology mentions."), TECHNOLOGY_PLATFORMS),
    roleLevel: choice(stateEvidence("What role level is supported by the title and the responsibilities together? Treat title as a prior and responsibilities, scope, authority and people leadership as decisive evidence. If evidence is insufficient, choose unknown.", "Do not infer authority from requirements, employer values or generic leadership language."), ROLE_LEVELS),
    mandateScope: choice("What is the broadest mandate explicitly supported by the JD?", { individual_delivery: "Primarily owns individual delivery.", workstream_or_project: "Owns a defined workstream, project, book of work or specialist area.", team_or_function: "Owns a team, function or major programme mandate.", business_unit_or_region: "Owns a business unit, country, region or material commercial mandate.", enterprise: "Owns an enterprise-wide or group-level mandate.", unknown: "Insufficient evidence." }),
    decisionAuthority: choice(stateEvidence("What is the highest decision authority explicitly supported by the responsibilities?", "Do not count generic accountability, support, review or risk language."), { execution: "Execution only.", recommendation: "Recommendation or advice.", approval: "Explicit approval or sign-off.", ownership: "Explicit ownership of outcome or decision domain.", not_stated: "The JD does not state authority." }),
    leadershipLevel: choice(stateEvidence("What leadership level is explicitly supported by the responsibilities?", "Collaboration is not leadership; absence of management language is not proof of IC status."), { individual_contributor: "Explicit IC role.", informal_influencer: "Mentors or influences without team ownership.", team_lead: "Leads a team or workstream without formal people management.", people_manager: "Explicit people management, hiring or performance ownership.", functional_leader: "Owns a function or multiple teams.", not_stated: "The JD does not state leadership." }),
    hasExplicitPeopleManagement: noul(stateEvidence("Does the responsibilities text explicitly state people management, direct reports, hiring or performance management?", "Yes only for explicit evidence; absence is not proof of individual-contributor status.")),
    hasExplicitApprovalAuthority: noul(stateEvidence("Does the responsibilities text explicitly state approval, authorization, sign-off or credit approval authority?", "Do not count generic accountability, support, review or risk language.")),
    workMix_clientFacing: noul(stateEvidence("Is substantive client-facing relationship or advisory work part of the role?", "Use responsibilities only.")),
    workMix_revenueAccountability: noul(stateEvidence("Does the role have explicit sales, revenue, budget or P&L accountability?", "Do not infer from commercial context alone.")),
    workMix_technicalDelivery: noul(stateEvidence("Does the role personally build, test, deploy or operate technology?", "Requirements-only technology skills do not count.")),
    workMix_analysis: noul(stateEvidence("Is producing analysis, research, modelling or recommendations a substantive output?", "Use recurring outputs in responsibilities.")),
    workMix_controlAssurance: noul(stateEvidence("Is control, compliance, audit, assurance or risk oversight a substantive output?", "Exclude boilerplate risk language.")),
    workMix_changeDelivery: noul(stateEvidence("Is change, project, programme or transformation delivery a substantive output?", "Exclude generic change-ready language.")),
    workMix_peopleLeadership: noul(stateEvidence("Is leading, managing or developing people a substantive responsibility?", "Require explicit evidence.")),
    workMix_trainingEnablement: noul(stateEvidence("Is training, enablement or knowledge transfer a substantive responsibility?", "Exclude generic collaboration.")),
    riskFlag1: choice("What is the most important structural risk in the JD? Choose none if the role description is sufficiently clear.", RISK_CODES),
    riskFlag2: choice("What is the second structural risk, if any? Choose none unless distinct and material.", RISK_CODES),
    riskFlag3: choice("What is the third structural risk, if any? Choose none unless distinct and material.", RISK_CODES),
    riskSeverity1: choice("How severe is the first selected structural risk?", RISK_SEVERITIES),
    riskSeverity2: choice("How severe is the second selected structural risk?", RISK_SEVERITIES),
    riskSeverity3: choice("How severe is the third selected structural risk?", RISK_SEVERITIES),
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
  const answerMeta = key => {
    const answer = raw?.[key];
    const confidence = typeof answer?.confidence === "number" ? answer.confidence : null;
    const probabilities = answer?.probabilities && typeof answer.probabilities === "object" ? answer.probabilities : null;
    const state = confidence !== null && confidence < 0.5 ? "low_confidence" : answer ? "ok" : "not_stated";
    return { confidence, probabilities, state };
  };
  const allowed = (value, map, fallback) => Object.prototype.hasOwnProperty.call(map, value) ? value : fallback;
  const distinctChoices = (keys, map, excluded = []) => [...new Set(keys.map(key => answerValue(key, "none")))]
    .filter(value => value !== "none" && Object.prototype.hasOwnProperty.call(map, value) && !excluded.includes(value));
  const legacyRisk = answerValue("riskFlag", root.riskFlags || root.riskFlag || "none");
  const roleRisks = distinctChoices(["riskFlag1", "riskFlag2", "riskFlag3"], RISK_CODES);
  if (!roleRisks.length && typeof legacyRisk === "string" && legacyRisk !== "none" && Object.prototype.hasOwnProperty.call(RISK_CODES, legacyRisk)) roleRisks.push(legacyRisk);
  const riskFlags = roleRisks.map((code, index) => ({ code, severity: allowed(answerValue(`riskSeverity${index + 1}`, "medium"), RISK_SEVERITIES, "medium") }));
  const roleArchetype = answerValue("roleArchetype", root.roleArchetype || "insufficient_evidence");
  const primaryActivity = answerValue("primaryActivity", root.primaryActivity || "other_unknown");
  const businessDomain = answerValue("businessDomain", root.businessDomain || root.businessDomains?.[0] || "other_unknown");
  const servedBusinessLine = answerValue("servedBusinessLine", root.servedBusinessLine || "multi_line_unspecified");
  const operatingContext = answerValue("operatingContext", root.operatingContext || "not_stated");
  const secondaryActivities = distinctChoices(["secondaryActivity1", "secondaryActivity2"], ACTIVITIES, [primaryActivity]);
  const businessProducts = distinctChoices(["businessProduct1", "businessProduct2"], BUSINESS_PRODUCTS);
  const technologyPlatforms = distinctChoices(["technologyPlatform1", "technologyPlatform2"], TECHNOLOGY_PLATFORMS);
  const productOrPlatformContext = [...businessProducts, ...technologyPlatforms];
  const titleSignals = input.title ? deriveTitleSignals(input.title, input.company) : (root.titleSignals || { market: "unknown", normalized: "unknown", tags: [], markers: [] });
  const titleLevelSignal = allowed(titleSignals.normalized || titleSignals.market || "unknown", TITLE_LEVELS, "unknown");
  const rawRoleLevel = answerValue("roleLevel", root.mandate?.roleLevel || root.roleLevel || answerValue("seniorityBand", root.seniorityBand || "unknown"));
  const roleLevel = allowed(rawRoleLevel === "unknown" && titleLevelSignal !== "unknown" ? titleLevelSignal : rawRoleLevel, ROLE_LEVELS, "unknown");
  const modelLeadership = answerValue("leadershipLevel", root.leadershipLevel || "not_stated");
  const peopleEvidence = answerValue("hasExplicitPeopleManagement", "no") === "yes";
  const leadershipLevel = modelLeadership === "people_manager" && !peopleEvidence ? "not_stated" : modelLeadership;
  const seniorityAlignment = titleSignals.tags?.includes("employer_band_convention") || titleSignals.tags?.includes("client_facing_title") ? "employer_title_convention" : (titleLevelSignal === roleLevel || titleLevelSignal === "unknown" ? "aligned" : "ambiguous");
  const confidence = Object.fromEntries(["roleArchetype", "servedBusinessLine", "operatingContext", "roleLevel", "mandateScope", "decisionAuthority", "leadershipLevel"].map(key => [key, answerMeta(key)]));
  const states = Object.fromEntries(Object.entries(confidence).map(([key, meta]) => [key, meta.state]));
  const workMix = Object.fromEntries(["clientFacing", "revenueAccountability", "technicalDelivery", "analysis", "controlAssurance", "changeDelivery", "peopleLeadership", "trainingEnablement"].map(key => [key, answerValue(`workMix_${key}`, "unknown")]));
  return {
    schemaVersion: 3,
    taxonomyVersion: TAXONOMY_VERSION,
    roleArchetype: allowed(roleArchetype, ROLE_ARCHETYPES, "insufficient_evidence"),
    workProfile: { primaryActivity: allowed(primaryActivity, ACTIVITIES, "other_unknown"), secondaryActivities, workMix },
    businessContext: { businessDomain: allowed(businessDomain, BUSINESS_DOMAINS, "other_unknown"), servedBusinessLine: allowed(servedBusinessLine, SERVED_BUSINESS_LINES, "multi_line_unspecified"), operatingContext: allowed(operatingContext, OPERATING_CONTEXTS, "not_stated"), businessProducts, technologyPlatforms, productOrPlatformContext },
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
    businessDomains: [businessDomain],
    seniorityBand: allowed(roleLevel, ROLE_LEVELS, "unknown"),
    responsibilityLevel: answerValue("responsibilityLevel", root.responsibilityLevel || "unknown"),
    riskFlags,
    confidence,
    states,
    evidence: input.jevInput ? { level: input.jevInput.evidence_level || "unknown", flags: input.jevInput.evidence_flags || [] } : { level: "unknown", flags: [] },
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
  try { return jsonResponse(200, { schemaVersion: 3, analysis: await callProvider(input, env) }); }
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
