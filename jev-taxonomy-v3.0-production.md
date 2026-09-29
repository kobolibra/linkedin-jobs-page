# JEV Taxonomy v3.0 — 六字段生产定义

> 本文与当前 `worker.js`、`app.js`、`scripts/jobspy/jev_preprocess.py` 实现对齐。JEV 的目标是评价 **JD 所代表的岗位**，不是评价候选人，也不是仅凭雇主或职位标题猜测。

## 1. 线上卡片只展示六个字段

1. **Role Archetype**：岗位的主导职业产出
2. **Primary Activity**：由独立 work-mix 证据派生的主导工作活动
3. **Business Line Served**：岗位服务的业务线
4. **Operating Context**：岗位所在的运营/法律实体上下文
5. **Business Products**：岗位反复处理、销售、分析、运营或拥有的业务产品；没有产品但有技术平台时显示 `Business Products / Platforms`
6. **Leadership Level**：JD 明确支持的人员/团队领导责任

以下字段仍保留在 API 内部用于解释、门控和兼容，但不作为卡片主维度展示：title level signal、role level、seniority alignment、mandate scope、decision authority、technology platforms、confidence、states、evidence、role risk。

> **Historical baseline only.** Production is now [`jev-taxonomy-v3.1.md`](jev-taxonomy-v3.1.md), with `schemaVersion: 5`. This file is retained solely for migration history.

## 2. 证据原则

证据优先级：

1. 明确 ownership、accountability、decision 和 measurable outputs；
2. 反复出现的 responsibilities 和 deliverables；
3. 明确 scope、authority、people leadership；
4. title 只作弱先验；
5. 单个关键词最低优先级。

Requirements、雇主价值观、benefits、招聘流程和通用合规句不是岗位产出。通用 title（例如 `Consultant Specialist`、部分雇主的 `Associate Director`）不得单独证明岗位级别或 archetype。

预处理器会：

- 清理 HTML、重复行和高置信 employer boilerplate；
- 分离 `role_summary`、`responsibilities`、`requirements`、`employer_metadata`；
- 检测语言、短 JD、模板占位符、外包边界、多角色和 requirements 主导；
- 从 `Business:`、entity、company 和上下文生成 `servedBusinessLineHint`、`operatingContextHint`；hint 只在存在高置信实体/业务线词时生成，模型在无 hint 时再判断。

## 3. Role Archetype

输出是一个 v3 code。每个 criteria 都包含排除边界；多角色 JD 取责任篇幅和产出最主要者。

### CS — Client & Commercial

| Code | Archetype | 判定核心 |
|---|---|---|
| CS1 | Relationship Management & Coverage | 拥有客户/账户/关系组合和 coverage 结果；不是纯获客或产品支持 |
| CS2 | Sales & Origination | 获客、发起、销售、分销和收入产生；不是持续账户覆盖 |
| CS3 | Product Sales & Advisory | 专业产品/解决方案建议与产品销售支持；不拥有产品生命周期 |
| CS4 | Customer Service & Acquisition | 前线客服、contact centre、网点或客户获取 |
| CS5 | Investment Banking Advisory | M&A、ECM、DCM、corporate finance、承销和投行建议 |
| CS6 | Markets Sales & Distribution | 市场产品销售、分销、structuring 或 market-facing execution |

### IR — Investment, Markets & Research

| Code | Archetype | 判定核心 |
|---|---|---|
| IR1 | Investment Research & Strategy | 投资、市场、经济、行业研究和建议 |
| IR2 | Portfolio Management & Asset Allocation | 投资组合、资产配置或投资 mandate 决策 |
| IR3 | Credit Underwriting | 借款人评估、授信、承保、信用监控或一线信用决策 |

### RC — Risk, Compliance & Assurance

| Code | Archetype | 判定核心 |
|---|---|---|
| RC1 | Enterprise & Operational Risk | 企业、运营、模型、市场风险与控制监督；不是交易级授信 |
| RC2 | Financial Crime, KYC & AML | KYC、CDD、AML、制裁、欺诈、金融犯罪调查和控制 |
| RC3 | Compliance & Regulatory Affairs | 监管合规、政策、监控、合规建议和监管事务 |
| RC4 | Internal Audit & Assurance | 独立内审、 assurance testing 和审计报告；不是一/二道防线控制 |

### OP — Operations & Service

| Code | Archetype | 判定核心 |
|---|---|---|
| OP1 | Operations, Settlement & Servicing | 交易处理、结算、清算、中后台和运营 servicing |
| OP2 | Securities Services & Fund Administration | 托管、基金会计、transfer agency、证券服务管理 |
| OP3 | Service Delivery & Processing | 服务交付、case handling、行政处理和运营支持结果 |

### PS — Product, Strategy & Transformation

| Code | Archetype | 判定核心 |
|---|---|---|
| PS1 | Product Management & Governance | 产品定义、roadmap、生命周期、治理和产品结果 ownership |
| PS2 | Business Analysis & Delivery | BA、项目、PMO、delivery、requirements 与变更交付 |
| PS3 | Strategy & Transformation | 企业战略、转型、变革和 programme execution |
| PS4 | Technology Architecture & Delivery | 技术方案设计、架构或技术交付治理；不是纯协调 |

### TE — Technology & Engineering

| Code | Archetype | 判定核心 |
|---|---|---|
| TE1 | Software Application Engineering | 构建、测试、部署和维护业务应用/软件系统 |
| TE2 | Platform, Cloud & Reliability Engineering | 云、基础设施、平台、SRE、生产可靠性 |
| TE3 | Cybersecurity | 安全工程、安全运营、架构、威胁和安全 assurance |
| TE4 | Technology Architecture | 技术架构、标准、跨系统设计 |
| TE5 | Data Engineering & Analytics | 数据工程、数据平台、BI 和生产分析 |
| TE6 | AI, Quantitative & Advanced Analytics | AI/ML、量化模型、统计科学和高级分析 |

### CF — Corporate & Finance

| Code | Archetype | 判定核心 |
|---|---|---|
| CF1 | Finance, Accounting & Treasury | 会计、财控、资金、税务、FP&A、精算财务 |
| CF2 | People & Human Resources | HR、招聘、人才、薪酬和 people operations |
| CF3 | Marketing & Communications | 市场、传播、品牌、内容和客户沟通 |
| CF4 | Legal & Corporate Affairs | 法律、公司秘书、corporate affairs 和法律建议 |
| CF5 | Procurement & Vendor Management | 采购、sourcing、vendor 管理和第三方治理 |
| CF6 | Corporate Services | workplace、行政、设施等其他企业服务 |

特殊值：

- `other_profession`：证据清楚，但职业在受控 taxonomy 外；
- `insufficient_evidence`：核心责任太薄、太泛或互相矛盾；
- `not_applicable`：不是单一实质岗位，例如非职位 posting。

旧 v2.3 archetype 会在 Worker 归一化为 v3 code，避免历史缓存/旧 provider response 直接破坏前端。

## 4. Primary Activity：不再单独让模型排序

不再提问 `primaryActivity`、`secondaryActivity1/2` 这些容易与 Role Archetype 共线且要求模型排序的 choice。

改为 10 个独立 noul（0–1 证据分数）：

| Work-mix key | 映射 activity |
|---|---|
| clientFacing | `client_relationships` |
| revenueAccountability | `sales_origination` |
| technicalDelivery | `technology_build` |
| analysis | `research_analysis` |
| controlAssurance | `risk_control` |
| operationsProcessing | `operations_processing` |
| changeDelivery | `strategy_transformation` |
| productOwnership | `product_ownership` |
| peopleLeadership | `people_leadership` |
| designResearch | `experience_design` |

派生规则：

- 分数最高且 `>= 0.5` 的活动为 Primary Activity；
- 其余分数 `>= 0.65` 的最多两个为 secondary activities；
- 无活动达到阈值时为 `other_unknown`；
- 这保证 Role Archetype 与 Primary Activity 都基于同一份 responsibilities 证据，不再出现 Software Engineering 配 Reporting Coordination 的明显冲突。

## 5. Business Line Served

此字段回答“这份岗位服务哪条业务线”，不是“员工属于哪个职能”。受控值：

```text
personal_retail
wealth_premier
private_banking
commercial_business
corporate_institutional
transaction_banking_payments_trade
securities_services
global_markets
investment_banking_advisory
asset_management_funds
insurance
group_functions_enterprise
multi_line
multi_line_unspecified
not_stated
```

优先使用 `employer_metadata` 的高置信 hint。例如：

- IWPB / Wealth & Premier → `wealth_premier`
- GTS / GPS / transaction banking / payments / trade → `transaction_banking_payments_trade`
- CTO / group technology / enterprise technology / Finance COO → `group_functions_enterprise`
- HASE / retail / branch → `personal_retail`
- Global Markets / FX / rates / trading → `global_markets`
- corporate / institutional / wholesale → `corporate_institutional`

`multi_line` 表示文本明确说服务多条线；`not_stated` 表示没有业务线证据。两者不能再用一个模糊值混淆。

## 6. Operating Context

回答“岗位在哪个运营/法律实体上下文中、谁消费产出”：

```text
onshore_bank_business_unit
shared_service_centre
technology_development_centre
securities_or_ib_jv
asset_management_or_wealth_entity
insurance_entity
consumer_finance_or_other
not_stated
```

高置信 hint：

- Technology China / Technology Centre / GBS / Global Business Services / Solutions Center → `technology_development_centre`
- shared service / operations centre → `shared_service_centre`
- Qianhai / Securities / 证券 → `securities_or_ib_jv`
- Jintrust / Asset Management / Investment Management / 基金 → `asset_management_or_wealth_entity`
- Life / Insurance / 人寿 / 保险 → `insurance_entity`
- Sub-branch / 支行 / 网点 → `onshore_bank_business_unit`

不能只因 company 字段写着大型银行就推断 operating context。

## 7. Business Products 与 Platforms

### 7.1 Product families

产品从 24 个易重复值收敛为 14 个族：

```text
deposits_accounts_payments
cards_unsecured_lending
mortgages_secured_lending
corporate_lending_structured_finance
trade_finance_supply_chain
cash_management_liquidity
fx_rates_derivatives
equities_fixed_income_securities
structured_products
funds_mutual_private
discretionary_mandates_advisory
insurance_bancassurance
custody_fund_services
digital_channels_mobile_banking
```

每个产品族是一个 noul。只有当产品是岗位反复决策、销售、建议、分析、运营或 ownership 的对象时才算 Yes；雇主所属行业、一次性案例、技能列表和 incidental mention 均为 No。得分 `>= 0.65`，最多返回 3 个，按分数降序。

### 7.2 Technology platforms

仍使用 8 个平台族，每个都是 noul，阈值同样为 `0.65`：

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

编程语言、工具、认证和普通软件使用不是平台上下文。技术岗位产品为空但平台非空时，卡片显示 `Business Products / Platforms`，不再显示毫无价值的空产品行。

## 8. Leadership Level

受控值：

```text
individual_contributor
informal_mentor_or_lead
team_lead
people_manager
manager_of_managers
not_stated
```

判定规则：

- 可读 JD 没有任何人员领导责任时，默认 `individual_contributor`；协作、协调、stakeholder management、working with 不算 leadership；
- `informal_mentor_or_lead` 只用于反复写明 mentoring/coaching 或无职权牵头 initiative/community；不因泛化 leadership boilerplate 触发；
- `team_lead` 需要明确 team/squad/pod/workstream leadership，但没有 direct reports、招聘或绩效管理；
- `people_manager` 需要 direct reports、hiring、performance management 或 team ownership；
- `manager_of_managers` 需要管理 team leaders、多团队或完整 function；
- `not_stated` 仅用于 JD 太薄，无法阅读领导证据。

代码门控：

1. provider 返回 `people_manager`/`manager_of_managers`，但 explicit people-management noul < 0.5 → 降为 `team_lead`（若 team evidence 也不足则 `individual_contributor`）；
2. provider 返回 `not_stated`，但 evidence 不是 thin/insufficient → `individual_contributor`；
3. provider 返回 `individual_contributor`，但 explicit team evidence >= 0.5 → 升为 `team_lead`；
4. 旧值 `informal_influencer` → `informal_mentor_or_lead`，`functional_leader` → `manager_of_managers`，`unknown` → `not_stated`。

## 9. Role Risk

Role Risk 只展示实质性、可能误导岗位比较的结构风险，不展示 `thin_role_evidence`、`insufficient_role_evidence` 这类内部证据质量提示。

可选风险包括：

```text
title_scope_mismatch
seniority_ambiguity
responsibility_ambiguity
leadership_ambiguity
function_context_mismatch
contradictory_scope
title_inflation_by_convention
multiple_roles_in_one_jd
range_level_posting
bilingual_content_conflict
vendor_or_outsourced_ambiguity
location_or_entity_ambiguity
leadership_signals_conflict
```

最多 3 个 distinct risk。模板占位符、generic/template responsibilities、requirements 主导和翻译问题只能作为内部证据约束；如果确实形成结构风险，严重度最高为 `medium`，不能被模型随意升级为 High。

## 10. Confidence / state 展示

confidence 是 provider 分布集中度，不是正确率。

- `state=ok`：可以显示百分比；
- `low_confidence` 或 `conflicting`：不显示百分比，显示 candidates；
- `not_stated` / `not_applicable`：灰色文案，不显示百分比；
- Archetype 同时保留 role family，卡片显示 `Technology & Engineering · Software Application Engineering` 形式。

## 11. API、缓存与回归

- 请求：同源 `POST /api/jev/analyze`；TypeSafe secret 只在 Worker；
- JD/state 只进入 provider `state` 一次，question instructions 只引用 `responsibilities`、`role_summary` 等字段名，不复制全文；
- 浏览器缓存：`linkedin-jev-analysis-v3.0`；taxonomy 或 JD fingerprint 变化会自动重新分析；
- v3 Worker 回归：`node --test test-jev-worker.mjs`，当前 13/13；
- 预处理器：`python3 -m py_compile scripts/jobspy/jev_preprocess.py scripts/jobspy/build_frontend_payload.py`；
- 生产 sanity check：抽样检查 TE → `technology_build`、CS1/CS2 → client/sales、RC → risk/control、OP → operations、PS1 → product ownership；Leadership 的 IC 应成为可读普通 JD 的主要结果，而不是 informal influencer。
