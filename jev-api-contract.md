# JEV 分析接口契约

前端已经接入职位级 JEV 分析交互，但**不会在浏览器或 Git 仓库中保存 JEV API key**。

## Endpoint

```text
POST /api/jev/analyze
Content-Type: application/json
Accept: application/json
```

该地址应由同源 Cloudflare Worker/API 代理实现。代理负责：

1. 从服务端 secret 读取 JEV API key；
2. 调用 TypeSafe/JEV 的真实 endpoint；
3. 将结构化分析结果返回给浏览器；
4. 校验请求体大小、来源和频率，避免 API key 被滥用。

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

## Response

代理可以返回以下结构之一，前端会兼容 `analysis`、`result`、`data` 包装层：

```json
{
  "analysis": {
    "function": "markets_investment_research",
    "subFunctions": ["investment_research"],
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

## 安全边界

不要把以下内容放入 `app.js`、HTML、静态 JSON、GitHub Actions 日志或浏览器 localStorage：

- JEV API key
- 上游 JEV 私有 endpoint 的认证 header
- 任何长期有效的服务端 token

当前前端默认调用 `/api/jev/analyze`。收到真实 endpoint、请求格式和响应 schema 后，只需要实现代理，不需要修改按钮、缓存和展示层。
