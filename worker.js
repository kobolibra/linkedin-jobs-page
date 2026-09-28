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
const DEFAULT_MODEL = "jev-latest";
// The Worker asset cache can retain the HTML shell after a GitHub Pages
// publish. Fetch the exact published shell by commit so new asset query
// versions become visible without waiting for an edge purge.
const INDEX_SOURCE_URL = "https://raw.githubusercontent.com/kobolibra/linkedin-jobs-page/ec08cf0a61e08d04a6b9ade63a178e3365c6d7fc/index.html";

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
  return {
    jobId: text(value.jobId, 200),
    title: text(value.title, 300),
    company: text(value.company, 300),
    location: text(value.location, 120),
    description,
  };
}

export function buildProviderRequest(input, env) {
  const providerUrl = env.JEV_API_URL || DEFAULT_PROVIDER_URL;
  const model = env.JEV_MODEL || DEFAULT_MODEL;
  const questionMap = {
    roleArchetype: questions.roleArchetype,
    primaryActivity: questions.primaryActivity,
    businessDomain: questions.businessDomainV2,
    seniorityBand: questions.seniorityBand,
    mandateScope: questions.mandateScope,
    decisionAuthority: questions.decisionAuthority,
    leadershipLevel: questions.leadershipLevel,
    riskFlag: questions.riskFlag,
  };
  if (providerUrl.includes("router.requesty.ai")) {
    return { url: providerUrl, model, payload: {
      model: model.includes("/") ? model : `typesafe/${model}`,
      messages: [{ role: "user", content: JSON.stringify({ ...input }) }],
      response_format: { type: "questions", questions: questionMap },
    } };
  }
  return { url: providerUrl, model, payload: {
    state: { jobId: input.jobId, title: input.title, company: input.company, location: input.location, description: input.description },
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

export function parseProviderResponse(providerResponse) {
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
  const risk = answerValue("riskFlag", root.riskFlags || root.riskFlag || "none");
  const riskFlags = (risk && risk !== "none" ? (Array.isArray(risk) ? risk : [{ code: risk, severity: "medium" }]) : [])
    .filter(item => !["location_ambiguity", "jd_too_short", "placeholder_or_test_role"].includes(item?.code));
  const roleArchetype = answerValue("roleArchetype", root.roleArchetype || "other_unknown");
  const primaryActivity = answerValue("primaryActivity", root.primaryActivity || "other_unknown");
  const businessDomain = answerValue("businessDomain", root.businessDomain || root.businessDomains?.[0] || "other_unknown");
  const leadershipLevel = answerValue("leadershipLevel", root.leadershipLevel || "unknown");
  return {
    schemaVersion: 2,
    roleArchetype,
    workProfile: { primaryActivity, secondaryActivities: [] },
    businessContext: { businessDomain, productOrPlatformContext: [] },
    mandate: {
      roleLevel: answerValue("seniorityBand", root.seniorityBand || "unknown"),
      mandateScope: answerValue("mandateScope", root.mandateScope || root.responsibilityLevel || "unknown"),
      decisionAuthority: answerValue("decisionAuthority", root.decisionAuthority || "unknown"),
    },
    leadershipLevel,
    roleRisk: { riskFlags },
    // Compatibility aliases for older cached clients.
    function: answerValue("function", root.function || "unknown"),
    subFunctions: Array.isArray(root.subFunctions) ? root.subFunctions : (root.subFunctions ? [root.subFunctions] : []),
    businessDomains: [businessDomain],
    seniorityBand: answerValue("seniorityBand", root.seniorityBand || "unknown"),
    responsibilityLevel: answerValue("responsibilityLevel", root.responsibilityLevel || "unknown"),
    riskFlags,
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
    return parseProviderResponse(JSON.parse(bodyText));
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("provider_timeout"), { status: 504 });
    throw error;
  } finally { clearTimeout(timer); }
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
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
  try { input = validateRequest(await request.json()); } catch (error) {
    const status = error.message === "description_required" ? 422 : 400;
    return jsonResponse(status, { error: error.message || "invalid_request" });
  }
  try { return jsonResponse(200, { schemaVersion: 2, analysis: await callProvider(input, env) }); }
  catch (error) { return jsonResponse(error.status || 502, { error: error.message || "analysis_failed" }); }
}

async function serveFreshIndex(request, env) {
  if (new URL(request.url).pathname !== "/") return env.ASSETS.fetch(request);
  try {
    const upstream = await fetch(INDEX_SOURCE_URL, { cf: { cacheTtl: 0, cacheEverything: false } });
    if (!upstream.ok) return env.ASSETS.fetch(request);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-content-type-options": "nosniff",
        "x-linkedin-index-source": "ec08cf0",
      },
    });
  } catch {
    return env.ASSETS.fetch(request);
  }
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
