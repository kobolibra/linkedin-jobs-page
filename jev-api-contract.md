# JEV 分析接口契约

## 当前实现状态

前端按钮调用同源 `POST /api/jev/analyze`。Cloudflare Worker 现在提供代理 handler；浏览器永远不会接触 JEV/Requesty key。Worker 默认适配 Requesty 的 TypeSafe Jev 兼容接口：

- URL：`https://router.requesty.ai/v1/chat/completions`
- Model：`typesafe/jev-latest`
- Authentication：`Authorization: Bearer <REQUESTY_API_KEY>`
- Response format：`{"type":"questions","questions":{...}}`

上游 endpoint/model 可通过 Worker secrets/vars 覆盖：`JEV_API_URL`、`JEV_MODEL`、`JEV_API_KEY`。默认情况下使用 `REQUESTY_API_KEY`。推荐生产环境使用版本化模型（例如 `typesafe/jev-1.13.0`）完成回归评估后再固定。

## Endpoint

```text
POST /api/jev/analyze
Content-Type: application/json
Accept: application/json
```

该地址由同源 Cloudflare Worker/API 代理实现。代理负责：

1. 从服务端 secret 读取 JEV API key；
2. 调用 TypeSafe/JEV 的真实 endpoint；
3. 将结构化分析结果返回给浏览器；
4. 校验请求体大小、来源和频率，避免 API key 被滥用。

## Worker 部署要求

在 Cloudflare Worker `linkedin` 上配置：

```text
REQUESTY_API_KEY = <secret>
# 可选：JEV_MODEL = typesafe/jev-1.13.0
# 可选：JEV_API_URL = https://router.requesty.ai/v1/chat/completions
```

如果 key 未配置，接口会返回 `503 {"error":"provider_not_configured"}`，而不是 404；这是可诊断的配置错误。仓库的 `.github/workflows/deploy-cloudflare.yml` 需要 GitHub Actions secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。

## Request

```json
{
  "jobId": "ln:4470905602",
  "title": "Investment Analyst",
  "company": "Schroders",
  "location": "CN",
  "description": "当前职位的纯文本 JD"
}
```

前端只有在用户点击 **JEV 分析此职位** 时发送请求，不会在页面加载、列表渲染或 JD 展开时调用。

Worker 限制：description 至少 40 个字符，最多 30,000 个字符；body 最多约 48 KB；同一 Worker isolate 对单一 IP 每分钟最多 12 次。请求只允许同源浏览器 origin。

## Response

Worker 返回以下结构，前端也兼容 `analysis`、`result`、`data` 包装层：

```json
{
  "schemaVersion": 1,
  "analysis": {
    "function": "markets_investment_research",
    "subFunctions": [],
    "businessDomains": ["asset_management_funds"],
    "seniorityBand": "analyst_associate_consultant",
    "responsibilityLevel": "individual_contributor",
    "isFormalPeopleManager": "no",
    "directReportsRequired": "no",
    "teamLeadershipRequired": "no",
    "leadershipType": [],
    "riskFlags": []
  }
}
```

Worker 将 Requesty assistant JSON 统一归一化为上面的 schema。

## 缓存策略

浏览器使用 localStorage：

```text
linkedin-jev-analysis-v1
```

缓存键是职位 ID，记录包括：

- `jobId`
- 当前 JD 的 SHA-256 指纹
- `analyzedAt`
- 结构化分析结果

同一职位、同一 JD 指纹再次点击时直接展示本地缓存，不发送请求。

如果 repost 后 JD 内容发生变化，指纹变化，前端会将它视为新的 JD 版本重新分析；旧缓存不会覆盖原始 JD，也不会影响 `datePosted`、`lastPosted`、`jobStatus` 或 repost 判断。

## 为什么之前是 404

此前提交只新增了 `app.js` 的按钮和 `jev-api-contract.md`，但当前部署是纯静态 assets，既没有 Worker `fetch` handler，也没有 `/api/jev/analyze` 路由。静态资产系统对未存在路径直接返回 404，因此按钮必然失败。现在 `worker.js` 和 `wrangler.jsonc` 负责把 API route 与静态 assets 放在同一个 Worker 中。

## 安全边界

不要把以下内容放入 `app.js`、HTML、静态 JSON、GitHub Actions 日志或浏览器 localStorage：

- JEV API key
- 上游 JEV 私有 endpoint 的认证 header
- 任何长期有效的服务端 token

当前前端默认调用 `/api/jev/analyze`；代理实现已在 `worker.js`，不需要修改按钮、缓存和展示层。
