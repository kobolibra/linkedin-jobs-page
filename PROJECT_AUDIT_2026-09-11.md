# LinkedIn Jobs Page 项目审计报告

**审计日期：** 2026 年 9 月 11 日（星期五）  
**审计范围：** 数据抓取、JobSpy 全量快照、n8n RSS 增量、生命周期合并、GitHub Actions 发布、前端排序/去重/渲染和 live 站点数据。  
**审计基线：** `kobolibra/linkedin-jobs-page` 的 `main` 分支，提交 `8576820`；同时核对 live 站点 `linkedin.claudecowork.workers.dev`。

## 一、结论先行

这个项目目前不是单一的“排序字段写错”问题，而是**数据生命周期、发布时序、前端去重和首屏渲染策略叠加在一起**。用户观察到的现象有一部分可以由代码直接解释，另一部分则说明刷新时可能读到了不同发布版本，或者页面显示的 519 条数据并不是本次审计时 live 站点返回的同一份快照。

最重要的结论如下。

| 优先级 | 已确认问题 | 直接影响 |
|---|---|---|
| P0 | 前端分组和排序使用 `pushTime`，不是职位首次发现时间 `firstSeen`。 | 任何被错误推进 `pushTime` 的旧职位都会被显示为最新职位。 |
| P0 | RSS 合并和 JobSpy 合并分别维护 `pushTime`，发布链路在同一字段上存在不同历史语义。 | 同一职位可能在不同抓取源之间反复改变“最新”位置。 |
| P0 | 前端对中国职位做“城市 + 公司 + 标题”去重，而不是只按 LinkedIn 职位 ID 去重。 | 当前 live 数据中有 **445 行**被前端二次去掉；合法的不同职位可能直接消失。 |
| P1 | `jobs.json` 的数据源顺序是旧职位在前、新职位追加在后；前端必须排序才能修正顺序。 | 一旦前端脚本、数据文件或 CDN 在刷新时不是同一版本，首条职位会发生跳变。 |
| P1 | 当前代码的单次加载逻辑不会在数据加载完成后自动重新拉取职位。 | “同一次加载中某职位先出现、随后被前端逻辑删除”的解释不成立，更像是版本/响应不一致或用户观察到了两次加载。 |
| P1 | 当前 live `jobs.json` 返回 7,600 行，去重前 6,981 条有效，前端去重后 6,709 条有效；这与用户看到的“519 个有效职位”不一致。 | 519 不能由当前这份 live 快照和当前 `isActiveJob` 逻辑产生，需要继续追查当时实际响应、浏览器筛选状态或历史版本。 |

## 二、实际运行链路

项目的职位链路如下：

```text
LinkedIn / JobSpy 全量公司快照
        │
        ├── reconcile_full_snapshots.py
        │       ├── 更新职位字段
        │       ├── 标记完整快照中消失的职位为 expired
        │       └── 仅在 JobSpy 明确确认同日 repost 时推进 pushTime
        │
        ├── n8n RSS 增量快照
        │       └── merge_n8n_incremental.py
        │               ├── 以 LinkedIn ID 合并
        │               ├── 保持已有 firstSeen
        │               ├── 当前实现不允许普通 RSS 推进已有 pushTime
        │               └── RSS 重新观察会恢复 expired 职位
        │
        └── jobs.json
                │
                └── app.js
                        ├── 读取 jobs.json
                        ├── 前端二次去重
                        ├── 按 pushTime 分组和排序
                        ├── 逐组创建 DOM
                        └── apply() 只负责过滤和隐藏，不重新排序
```

`jobs.json` 是静态文件。前端在 `app.js:342` 使用 `fetch("jobs.json", {cache: "no-cache"})` 读取它。读取完成后，前端在 `app.js:350` 调用 `keepLatestSameCityTitle(data)`，然后在 `app.js:409–411` 使用 `placeAt(job)` 分组和排序。

## 三、问题一：所谓“最新”实际上由 `pushTime` 决定

前端定义了两个不同的时间概念：

```js
const seenAt = j => j.firstSeen || j.pushTime;
const placeAt = j => j.pushTime || j.firstSeen;
```

其中 `seenAt` 用于统计和职位年龄，`placeAt` 用于列表位置。列表实际使用的是：

```js
const t = placeAt(j);
```

因此，页面顶部表达的不是“最近首次发现的新职位”，而是“`pushTime` 最大的职位”。这两个定义只有在 `pushTime` 被严格维护时才等价。

当前 live 数据中，目标职位 `Associate Director, Software Engineering (GenAI Agent Platform)` 的记录为：

| 字段 | 值 |
|---|---|
| LinkedIn ID | `4462828178` |
| `firstSeen` | `2026-09-03` |
| `pushTime` | `2026-09-11T03:35:55.170189Z` |
| `lastSeenAt` | `2026-09-11T03:35:55.170189Z` |
| `jobStatus` | `active` |

它因此确实会被前端排序到 2026 年 9 月 11 日分组的第一条。当前 live 数据中，前端排序后的最新分组只有这条目标职位。

用户看到它短暂位于第一条，说明在某次响应中它的 `pushTime` 被识别为最新。之后变成 `Emerging Markets Business Development Manager`，则说明后续页面状态使用了另一份数据、另一份生成结果，或另一轮刷新。**当前 `app.js` 本身没有定时 fetch，也没有在一次 fetch 完成后删除该职位的代码。**

## 四、问题二：RSS 和 JobSpy 对 `pushTime` 的历史语义曾经不一致

当前 `merge_n8n_incremental.py` 已经加入了保护逻辑。对已有职位，RSS 字段 `firstSeen` 和 `pushTime` 会被跳过，代码注释明确写着 RSS 不能单独证明 repost。

当前 `reconcile_full_snapshots.py` 也明确规定：

1. 已有职位保留原始 `firstSeen`。
2. 普通 JobSpy 重复观察不推进 `pushTime`。
3. 只有 `jobspyRepost is True` 且 `datePosted` 与观察日期为同一自然日时，才推进 `pushTime`。

但是仓库历史中存在多次相反语义的修复和回滚痕迹，包括：

- `5925e960`：恢复 RSS-derived push times。
- `bb8f60d7`：恢复目标职位 repost timestamp。
- `ca853fe`：修复按 first seen 排序。
- `b981dea`：只为确认的 repost 推进 push time。
- `8576820`：发布完整公司快照并加入过期状态。

这说明项目曾经把“RSS 观察到职位”和“职位被重新发布”混为一谈。即使当前代码已经部分修正，`jobs.json` 中仍然保留了历史修复产生的 `pushTime`。例如，许多职位的 `firstSeen` 集中在 2026 年 9 月 9 日，而 `pushTime` 集中在 2026 年 9 月 10 日。只要其中任何一个来源把普通再观察误标成推送，旧职位就会长期出现在顶部。

## 五、问题三：前端二次去重会让职位真正“消失”

前端在 `app.js:220–236` 定义了：

```js
城市 + 公司 + 标题
```

作为中国职位的去重键。对于同一个键，它只保留：

1. active 记录优先于 expired 记录；
2. 同一状态下 `pushTime` 较新的记录。

这与后端已使用的 LinkedIn 职位 ID 去重是两套不同规则。后端审计显示 `jobs.json` 有 7,600 行且 LinkedIn ID 全部唯一，但前端又删除了 445 行。

当前 live 数据的实测结果如下：

| 阶段 | 总行数 | 有效行数 |
|---|---:|---:|
| `jobs.json` 原始数据 | 7,600 | 6,981 |
| 前端 `keepLatestSameCityTitle` 后 | 7,155 | 6,709 |
| 前端删除 | 445 | 272 条有效记录也被连带去掉 |

审计发现真实碰撞，例如同一个城市、公司和标题下存在多个不同 LinkedIn ID。以下是实际出现过的模式：

- HSBC、广州、`Sr. Associate Director, Data and Analytics`。
- HSBC、广州、`Senior Consultant Specialist`。
- Standard Chartered、广州、`Principal Software Engineer Distributed Systems (Singapore / China)`。
- HSBC、广州、`Consultant Specialist`。

这些记录虽然标题相同，但可能对应不同的职位编号、业务线、发布日期或地点。前端只保留一条，因而确实可能造成用户所说的“职位自动消失”。

目标职位本身有多个城市记录，但当前精确标题的深圳记录中，最新的 2026 年 9 月 11 日记录会胜出，因此它不是这次目标职位消失的直接去重受害者。可是，这套规则会影响其他职位，也会造成用户对职位数量和列表稳定性的明显不信任。

## 六、问题四：当前页面的 519 条与 live 快照不一致

我通过带随机查询参数的请求直接读取 live `jobs.json`，返回结果为：

- `count = 7600`。
- `jobStatusUpdatedAt = 2026-09-11T03:35:55.170189Z`。
- 原始有效记录数为 6,981。
- 按当前前端去重模型计算后的有效记录数为 6,709。

当前 `isActiveJob` 的实现是：

```js
const isActiveJob = job => job?.jobStatus !== "expired";
```

因此，当前快照不可能在没有额外筛选条件的情况下显示 519 条有效职位。用户截图中的 519 更可能来自以下情况之一：

1. 截图时页面加载的是另一份旧快照；
2. 浏览器保留了搜索、机构、地区、年龄或收藏筛选状态；
3. 数据文件和页面代码来自不同发布版本；
4. 519 是当时发布过程中的中间快照，而不是当前 live 文件。

仅凭当前仓库和当前 live 响应，不能把 519 精确归因到某一个前端函数。需要保留每次发布的 manifest 和浏览器实际响应，才能把该数字与具体版本对应起来。

## 七、为什么会出现“先显示目标职位，随后第一条变成旧职位”

在当前代码下，单次正常加载的流程是：

1. 浏览器请求一次 `jobs.json`。
2. 前端对这份响应执行一次去重。
3. 前端按 `pushTime` 排序并构造 DOM。
4. `apply()` 只隐藏不符合筛选的卡片，不改变排序。

因此，单次加载中目标职位被代码自动从第一条删除的证据不足。更合理的解释是**发布版本或静态资源响应不一致**：

- HTML、`app.js` 和 `jobs.json` 是三个独立的静态资源。
- 它们没有共享版本号或 manifest。
- GitHub Actions 会在抓取流程中提交 `jobs.json`，而部署工作流由另一个 push 触发。
- JobSpy 工作流自身使用 GitHub Actions token 提交数据，实际是否触发后续部署需要单独确认。
- 页面刷新期间如果不同资源来自不同发布版本，就可能出现“页面先看到一版职位，随后又看到另一版职位”的现象。

当前 live 的 `app.js` 与仓库 `app.js` SHA-256 完全一致，说明前端脚本本身已经同步到当前仓库代码。但这不能证明用户当时那一次刷新使用的 `jobs.json`、HTML 和脚本来自同一个发布版本。

## 八、自动化与发布流程中的重要风险

JobSpy 和 RSS 发布工作流都使用 `jobspy-incremental` 并发组，且 `cancel-in-progress: false`。这可以避免同组任务被取消，但并不能让多个提交天然成为一个原子发布单元。

当前流程可能经历：

1. RSS 更新 `data/n8n/rss-latest.json`。
2. RSS 工作流 checkout 当前 `main`，合并并提交 `jobs.json`。
3. JobSpy 工作流 checkout 某个起始版本，生成全量快照并提交 `jobs.json`。
4. 两者通过 push/rebase 重试解决 Git 冲突。
5. 静态部署再从某一个提交生成站点。

虽然工作流有重试和并发控制，但页面资源没有共同的版本标识。用户无法知道当前 HTML、JavaScript 和 JSON 是否来自同一个 commit。对于依赖“最新职位”这一强一致视觉结果的页面，这个缺口很关键。

## 九、现有测试结果

项目现有 Python 测试全部通过：

- `test_merge_n8n_incremental.py`：RSS 合并测试通过。
- `test_reconcile_full_snapshots.py`：JobSpy 生命周期测试通过。
- 总计 16 个测试，全部通过。

这些测试验证了后端合并函数的局部规则，但没有覆盖以下关键行为：

1. 前端 `keepLatestSameCityTitle` 是否错误删除不同 LinkedIn ID 的合法职位。
2. 浏览器实际加载的 HTML、脚本和 JSON 是否来自同一个版本。
3. 多个发布工作流连续提交时，live 站点是否可能短暂暴露混合版本。
4. `pushTime` 的历史修复是否会把旧职位再次推到顶部。
5. 页面显示数量与原始快照、前端去重后的数量是否一致。

因此，“测试全绿”不能证明用户看到的列表逻辑正确。

## 十、建议的修复顺序

### 第一阶段：先消除职位错误消失

前端不应再按“城市 + 公司 + 标题”删除职位。后端已经按 LinkedIn ID 去重，前端应直接保留后端提供的唯一职位记录。若确实需要展示相同标题的职位，应在卡片上显示城市和 LinkedIn ID，而不是静默删除。

### 第二阶段：建立单一、明确的排序时间

建议增加一个明确字段，例如 `publishedAt` 或 `sortAt`，并规定：

- 新职位：使用首次被系统确认发现的时间。
- 普通 RSS 观察：不改变该字段。
- JobSpy 确认同日 repost：才更新该字段。
- 过期后重新出现：单独记录 `reactivatedAt`，不要无条件覆盖原始发布时间语义。

前端只按这个字段排序，不再在 `pushTime`、`firstSeen` 和 `observedAt` 之间隐式选择。

### 第三阶段：让静态发布具备版本一致性

每次发布应同时生成：

```json
{
  "releaseId": "git-commit-sha",
  "generatedAt": "2026-09-11T03:35:55.170189Z",
  "jobsCount": 7600,
  "activeCount": 6981,
  "frontendDedupRemoved": 0
}
```

HTML 页面应显示或至少记录 `releaseId`。`app.js` 和 `jobs.json` 应带同一个版本号。发布脚本应先生成完整目录，再整体替换，而不是让三个文件在不同时间可见。

### 第四阶段：补充端到端回归测试

应加入一个浏览器或 JavaScript 测试，至少验证：

1. 不同 LinkedIn ID 的同城市同标题职位全部保留。
2. 最新职位不会在 `apply()` 后消失。
3. `count` 与可见 active 卡片数量一致。
4. 同一次加载中的首条职位在数据、DOM 和统计中一致。
5. 旧版本 `jobs.json` 与新版本 HTML 混用时可以被检测并拒绝展示。

## 十一、最终判断

用户对“新职位没有稳定展示在前面”的直觉是有依据的。当前项目至少存在一个确定的职位丢失问题：前端二次去重删除了 445 行，其中包括 272 条原本有效的记录。项目也存在一个确定的排序语义问题：列表按 `pushTime` 排序，而不是按稳定定义的首次发现时间。

但是，目标职位从第一条短暂消失并变为 `Emerging Markets Business Development Manager`，**不能由当前单次加载的 `app.js` 直接复现**。当前 live 数据中目标职位仍然是排序后的最新职位。这个现象更符合刷新时读到不同静态发布版本、缓存响应或筛选状态残留。

下一步最应该做的不是继续局部调整标题排序，而是先取消前端二次去重，再给 HTML、JavaScript 和职位 JSON 加统一发布版本，最后重新设计 `sortAt` 的唯一来源。否则即使这次把目标职位强行置顶，后续 RSS、JobSpy 和静态部署之间仍会继续产生相同类型的跳变。

## References

[1]: https://github.com/kobolibra/linkedin-jobs-page "LinkedIn Jobs Page repository"

[2]: https://linkedin.claudecowork.workers.dev/ "LinkedIn Jobs Page live site"


## 十二、第二轮逐文件复核新增发现（重要）

第二轮复核不再只看关键链路，而是核对了仓库当前提交中的全部非图片业务源码、HTML、CSS、Python 脚本、GitHub Actions 工作流、配置文件、测试文件及主要数据快照，并检查了 HTML 实际加载顺序和 live HTML。结论如下。

### 12.1 P0 安全问题：仓库源码硬编码 GitHub Personal Access Token

`auto-daily-companies.py:28` 直接把一个 GitHub Personal Access Token 写在源码中；同一文件随后在下载 jobs、下载黑名单和更新黑名单时使用该凭据。该文件是 Git 跟踪文件，凭据由提交 `87eb71b`（2026-09-03）引入，并至少存在于当前工作树与 Git 历史中。这不是职位排序问题，但属于必须立即处理的账户安全风险：应在 GitHub 侧撤销/轮换该 token，并把脚本改为读取运行环境 Secret，而不是把凭据写入仓库。由于撤销凭据会改变账户访问权限，本审阅没有擅自执行撤销。

### 12.2 实际加载的前端脚本边界

当前 `index.html` 实际加载的是 `app.js`、`row-fixes.js`、`top30-layout.js`、`salary-display.js`、`company-insight.js` 和 `guestbook.js`。`editorial-mapping.js` 虽然存在于仓库，但没有被当前 HTML 加载，因此不参与当前页面行为。逐一检查后，`row-fixes.js` 只重新定位过期徽章，`salary-display.js` 只改写 JD 展开控件和薪资标签，`top30-layout.js` 只重绘 Top 30 气泡图，`company-insight.js` 只渲染机构洞察面板，`guestbook.js` 只访问留言板 API；它们没有删除主职位卡片或重新排序主列表的逻辑。主列表的职位数量变化源头仍然是 `app.js` 的前端二次去重和过滤。

### 12.3 数据快照完整性核验

当前仓库 `jobs.json` 有 7,600 行、7,600 个唯一 LinkedIn ID，其中 3,477 行显式为 active、619 行为 expired、3,504 行没有 `jobStatus`；按当前前端规则“只有 expired 才不活跃”，因此有效数为 6,981。主要 JobSpy 增量快照有 994 行且 ID 唯一，基线快照有 904 行且 ID 唯一，n8n RSS 快照有 471 行且 ID 唯一。后端文件本身没有发现重复 LinkedIn ID；问题出在前端用城市、公司、标题再次合并不同 ID。

### 12.4 抓取器的行为边界

`fetch_linkedin_requests.py` 使用 LinkedIn guest search API，按公司和分页抓取，遇到 403/429/999/5xx 会重试；遇到首屏阻断会在状态摘要中记录失败，且工作流在全体公司没有职位时不发布新快照。它按 LinkedIn 数字 ID 去重，但搜索分页和 LinkedIn 返回结果仍然可能造成“某次观察缺失”，之后由完整快照协调器把明确缺失的职位标记 expired。这个机制不会在一次前端加载中删除卡片，但会使数据层出现 active/expired 状态变化。

### 12.5 发布流程的真实限制

JobSpy 与 RSS 工作流虽共享 `jobspy-incremental` concurrency group，但它们仍以多个独立 Git 提交更新静态资源；HTML、app.js、jobs.json 没有共享 release manifest。当前响应头显示 live 的 HTML 是 `cf-cache-status: MISS`，app.js 和 jobs.json 是 `HIT`，且三者没有对外暴露同一 release ID。因此不能把一次刷新视为原子地读取了同一个提交的完整站点。这个事实强化了“目标职位先出现、随后列表首条变化更像混合版本/不同响应”的判断，但仍不能仅凭当前证据确定用户当时具体读到的是哪两个版本。

## 十三、修正后的最终判断

我现在可以明确回答：**上一轮称“已经完整看完所有项目代码”说得过头了。** 第一轮完成的是关键链路审计，不是逐文件复核；第二轮才补齐了未加载脚本、辅助脚本、测试、数据快照、工作流尾段、实际 live HTML 和安全扫描。第二轮没有推翻原结论，反而新增确认了 P0 凭据泄露问题。

关于职位问题，能够确定的事实是：前端确实会静默删除不同 LinkedIn ID 的同城同公司同标题职位；列表确实按 `pushTime` 而非单一稳定的 `firstSeen/publishedAt` 语义排序；发布链路确实不是原子版本；而当前单次 `fetch -> 去重 -> 排序 -> 渲染 -> apply` 路径没有一个会把已渲染的目标职位自动删掉并换成另一条的定时刷新逻辑。因此，“自动消失”的直接可复现原因更可能发生在数据发布/响应版本切换，其他职位的真实消失则可由前端错误去重直接解释。

本报告没有修改业务代码，也没有撤销 GitHub token；下一步若进入修复，应先轮换凭据，再移除前端二次去重，随后引入带 releaseId 的原子发布和端到端浏览器回归测试。


## 十二、2026-09-11 14:57 之后的全景复核结果

本节是对前述报告的更新，以远端 `main` 当前提交 `8ca6be6`、当前 live 资源、n8n 两个 active workflow、最近 GitHub Actions 记录和仓库全部 Python/JavaScript 语法及测试结果为基线。此前报告中的部分数量来自较早提交，不能直接替代本节的当前数据。

### 12.1 当前代码和测试基线

远端 `origin/main` 与本地审计工作区一致，当前提交为 `8ca6be6`。仓库全部 Python 文件通过 `py_compile`，全部 JavaScript 文件通过 `node --check`；JobSpy 合并与生命周期测试共 **20 个，全部通过**；项目审计脚本也通过。

这说明当前代码没有静态语法错误，局部生命周期测试覆盖了 24 小时 repost、失败公司不失效、过期恢复、firstSeen 回填和 RSS 合并等规则。但是，测试通过并不等于发布链路安全，因为关键风险集中在跨 workflow、跨资源版本和真实外部执行行为上。

### 12.2 当前 GitHub Actions 实际链路

当前 JobSpy workflow `JobSpy full company snapshots` 已经不再直接写 `jobs.json`。它的实际动作是：矩阵抓取 10 家配置公司；合并搜索结果；如果所有公司都没有明确成功或空结果则不发布；成功时生成 `data/jobspy/incremental/latest.json`、`search_combined.json`、`latest.completed_at` 和历史索引；最后只提交这些 JobSpy 快照文件。当前 workflow 的发布提交标题为 `jobspy: publish snapshot for next canonical merge`。

n8n RSS workflow 修改 `data/n8n/rss-latest.json` 后触发 `Publish n8n RSS into canonical jobs`。该 workflow 会先从当前 `main` 读取最新 JobSpy `search_combined.json`，用 `reconcile_full_snapshots.py` 生成临时 JobSpy canonical 结果，再用 `merge_n8n_incremental.py` 合并 RSS，最后运行压缩脚本，只提交一次 `jobs.json`。成功 push 后又显式调用 `gh workflow run deploy.yml --ref main`，因此当前设计意图是：**JobSpy 只写快照，n8n 才写 canonical jobs.json，canonical 只触发一次页面部署**。

这个设计方向是正确的，但仍存在两个重要边界：第一，JobSpy 快照提交本身仍触发 `deploy.yml` 的 `push` 事件，只是 deploy 的 `paths` 当前排除了 `data/**`；第二，JobSpy、n8n 发布和手动修复 workflow 仍是多个独立提交，不是原子发布，页面资源仍没有统一 release manifest。

最近 GitHub 运行记录显示，n8n canonical 发布 workflow 最近记录全部成功；JobSpy 也有成功记录。但这只能证明 workflow 的最终状态，不代表每个提交都被网页以同一版本呈现。`deploy.yml` 使用 `cancel-in-progress: true`，如果短时间内出现多个 canonical 或前端提交，前面的部署会被取消，最终页面只保证收敛到某个后续版本，不保证每一次数据提交都曾稳定可见。

### 12.3 n8n 两个 active workflow 的真实配置

`Trigger JobSpy before RSS` 的 active version 是 `35bc01a9-46c4-4eaf-98cc-7bb4b3567558`，唯一触发为 cron `30 5,11,17,23 * * *`；它通过 GitHub API dispatch `jobspy-incremental.yml`。该时间按 UTC 解释，对应北京时间每日 **01:30、07:30、13:30、19:30**。

`Jobs` 的 active version 是 `5bf7a9d2-a4b7-4196-ae16-398294fdcf99`，唯一触发为 cron `0 */6 * * *`；对应北京时间每日 **08:00、14:00、20:00、02:00**。因此正常时序是 JobSpy 在 n8n 前约 30 分钟写快照，n8n 随后合并 RSS 和 JobSpy 并生成一次 canonical 发布。按这个配置，用户原先“每日 4 次 n8n 更新”的目标在架构上已经恢复；JobSpy 快照不会因为 `data/**` 路径再触发网页部署。

但是，n8n MCP 当前能查到 `Trigger JobSpy before RSS` 的最近成功执行 `6854`，而对 `Jobs` 查询不到任何执行记录。由于该 workflow 设置了 `saveDataSuccessExecution: none`，且当前执行查询返回空，无法仅凭 n8n 元数据确认 Jobs 最近每一次是否真的执行、是否读到了 blocklist、是否成功推送 staging。这个不是“Jobs 一定没跑”的证据，而是一个明确的**运行可观测性缺口**：生产链路的核心 workflow 没有可复核的成功执行证据。

### 12.4 n8n blocklist 当前确实被读取，但它不是网页前端删除机制

当前 Jobs workflow 有 `Read Blocklist` → `Filter Blocklist` 分支，并且 `Build RSS staging snapshot` 把 blocklist 写入 `data/n8n/rss-latest.json`。`Filter Blocklist` 只对本轮 RSS 进入 Google Sheets 的数据做过滤；真正从 canonical `jobs.json` 物理移除的逻辑是在 GitHub 的 `merge_n8n_incremental.py` 中完成。

当前 n8n staging 文件包含 **2548** 个 blocklist 条目，当前 canonical 元数据记录 `blocklistHardDelete: 2547`。这证明最近一次 canonical 合并确实读取了 blocklist 并执行过硬删除路径，而不是简单把职位标记为 expired。

需要特别注意：网页前端本身没有读取 Google Sheets blocklist，也没有执行公司的 blocklist 过滤。只要 GitHub canonical 合并失败、staging 没更新或 n8n 没执行，职位就不会因为前端逻辑自动消失。

### 12.5 当前 canonical 数据质量存在严重不一致

对当前仓库 `jobs.json` 的直接统计如下：

| 指标 | 当前值 |
|---|---:|
| canonical jobs 总数 | 7,614 |
| 唯一职位 ID | 7,614 |
| active | 3,502 |
| `jobStatus` 缺失/为 null | 3,500 |
| expired | 612 |
| `jobspyRepost === true` | 266 |
| 缺少 link/company/title | 0 |
| 缺少 pushTime | 1 |
| 缺少 lastSeenAt | 6,582 |
| `datePosted` 为日期值 | 1,352 |
| `datePosted` 缺失 | 6,262 |

这里最严重的是 **3,500 条记录没有明确 `jobStatus`**。前端 `isActiveJob` 使用 `job?.jobStatus !== "expired"`，因此 null 会被当作 active；这是一种宽松的兼容行为，不是数据完整性。它会让“未知状态”直接计入有效职位，也会掩盖上游生命周期没有写全的问题。当前 canonical 记录中还存在 6,582 条没有 `lastSeenAt`，说明历史数据与新生命周期数据混在一起，不能把所有记录都当作同等可信的实时状态。

当前数据时间检查发现 43 条记录的 `datePosted` 晚于 `pushTime`。这并不必然是错误：JobSpy repost 规则现在要求使用 JobSpy `datePosted` 作为新的 pushTime，而历史记录可能来自不同来源；但它表明数据中仍有历史字段语义不一致，不能仅凭字段名推断先后关系。建议后续给每条记录写入 `fieldSource` 或统一 `sortAt`，不要继续让前端自行猜测。

### 12.6 24 小时 repost 规则的实现结论

当前 `reconcile_full_snapshots.py` 的规则已经是：观察时间必须晚于 `datePosted`，且差值不超过 24 小时；只有 `jobspyRepost is True` 时才允许推进 `pushTime`，并使用 JobSpy 的 `datePosted`，而不是 workflow 运行时间。只有日期没有时分秒时，代码把该日期解释为北京时间零点；有完整时区时间戳时按实际 elapsed time 判断。对应的 24 小时边界测试已通过。

这部分当前实现与用户最终要求一致。但它仍依赖上游正确设置 `jobspyRepost` 和 `datePosted`。如果旧快照没有这些字段，代码不会凭空确认 repost；如果历史 canonical 已经被错误推进过，当前规则也不会自动回溯修正历史 `pushTime`。因此“以后新运行不再使用错误语义”可以成立，但“历史数据已经全部恢复正确”不能成立。

### 12.7 前端实际执行边界：Top30 脚本覆盖了 app.js 的固定坐标实现

`index.html` 先加载 `app.js`，再加载 `top30-layout.js`。app.js 内置的旧 `renderTop50` 仍然有固定 `domainMax = Math.max(50, ...)` 的实现，但 top30-layout.js 随后把全局 `renderTop50` 覆盖为 `safeRender`，实际正常情况下使用的是 Top30 v12 的自适应坐标域版本。因此不能只看 app.js 判断线上当前图表坐标。

Top30 v12 的优点是每个标签页独立计算坐标域，不再让 ALL/CN/HK/SG 强制共享同一最大值；坐标中心严格等于 mean/median 的投影，标签才允许移动。可是代码注释声称“bubbles are separated by a relaxation pass”，实际实现没有气泡中心 relaxation：`px`、`py` 被明确锁定为原始坐标，代码只做标签避让。因此，**同一坐标或相近坐标导致的气泡重叠无法被当前代码消除**。这是坐标真实性和视觉分离之间的真实设计冲突，不是简单调一个半径就能完全解决。专业的解决方向应是：保持数据坐标不动，采用透明度/描边、同点聚合、点击展开或仅对标签做避让；不能再把气泡中心强行挪开后假装坐标仍准确。

另一个风险是，如果 top30-layout.js 加载失败或脚本顺序被改变，app.js 的旧固定坐标实现会重新成为 fallback；当前没有自动化浏览器测试验证脚本加载失败时的表现。

### 12.8 前端列表仍存在确定的“职位消失”机制

当前 app.js 仍在加载后调用 `keepLatestSameCityTitle(data)`，对同一城市、公司、标题只保留一条，而不是按 LinkedIn 职位 ID 保留唯一记录。后端 canonical 已经按 ID 去重，前端再次按展示字段去重会继续删除合法职位。这个问题与 JobSpy/n8n 发布链路无关，仍然存在。

当前排序主键仍是 `placeAt(j) = j.pushTime || j.firstSeen`，同一精确时间再按 CN → HK → SG → OTHER 排序。这个地区排序实现符合用户提出的同批次规则；但它只有在 pushTime 被正确维护时才可靠。不同批次按完整时间戳优先，也符合后批次整体靠前的要求。问题在于历史 pushTime 已经可能带有旧语义，且数据里有 3,500 条缺少明确 jobStatus，导致“批次正确”与“数据是否真的属于该批次”仍是两件事。

### 12.9 安全审计：发现必须立即处理的硬编码 GitHub PAT

`auto-daily-companies.py:28` 当前直接硬编码了一个 `github_pat_...` 格式的 GitHub Personal Access Token。该 token 不仅存在于当前文件，也出现在 Git 历史多个提交中。它被用于读取和更新 `jobs.json` 与 `financial_blacklist.json`，因此不是无权限测试值，而是具有实际仓库操作能力的凭据风险。

这属于 **P0 安全问题**。即使当前脚本不在 GitHub Actions 主链路中执行，公开仓库历史中的 token 也应视为已泄露。正确处理顺序是：立即在 GitHub 撤销该 token；检查其审计日志；创建最小权限的新 token 或改用 GitHub Actions/OIDC；把脚本改成从环境变量读取；随后用 secret scanning 验证当前树和历史策略。由于撤销和重建账号凭据属于不可逆的账户安全操作，本次审计没有代替用户撤销凭据。

此外，本次对话中曾提供过 n8n MCP Bearer 凭据；从安全实践看，该凭据也应在 n8n 端轮换，不能继续复用。报告不重复记录任何明文 secret。

### 12.10 当前全景结论

当前项目不是“所有问题都已修好”，而是完成了若干重要结构性修复，但仍有五个必须优先处理的剩余问题：

1. **P0 安全：** 硬编码 GitHub PAT 已进入当前代码和 Git 历史，必须撤销并轮换。
2. **P0 数据一致性：** 3,500 条 canonical 记录缺少明确 `jobStatus`，6,582 条缺少 `lastSeenAt`；前端却把未知状态当 active。
3. **P0 列表正确性：** 前端同城同公司同标题二次去重仍会静默删除不同 LinkedIn ID 的职位。
4. **P1 可观测性和发布一致性：** n8n Jobs 执行记录查询为空，HTML/app.js/jobs.json 没有统一 releaseId；多 workflow 仍可能形成短暂混合版本。
5. **P1 图表实现一致性：** Top30 实际坐标已自适应，但“减少气泡重叠”的承诺与严格坐标锁定之间尚未解决，当前代码没有真正的气泡分离算法。

已确认的正面结果是：JobSpy 当前只提交快照、不直接提交 canonical `jobs.json`；n8n canonical 合并包含 JobSpy 快照；blocklist 已进入 staging 并由 GitHub 合并层执行物理删除；24 小时 repost 规则和局部测试已经通过；同一 pushTime 批次内 CN/HK/SG 顺序已经在前端实现。

因此，当前系统已经从“两个来源都直接改网页数据”的高风险状态，改善为“JobSpy 快照 → n8n 合并 → 单次 canonical 发布”的方向，但还不能称为完整闭环。下一步应先处理 token 和数据状态，再取消前端展示层二次去重，最后补 release manifest、n8n 成功心跳/审计记录和真实浏览器 E2E 测试。

## 十三、建议的执行顺序

第一步，立即撤销并轮换 GitHub PAT 与 n8n MCP Bearer；在完成轮换前不要继续扩大 workflow 权限。第二步，为所有 canonical job 补齐明确的 `jobStatus`、`lastSeenAt`、`source` 和 `sortAt`，并让前端只接受明确 active/expired 状态。第三步，删除 `keepLatestSameCityTitle` 的物理去重行为，改为只按职位 ID 去重。第四步，把 n8n Jobs 的成功执行写入一个不含职位正文的轻量 heartbeat 文件或 GitHub issue/artifact，并保留最近运行的失败信息。第五步，让 canonical 发布同时生成 `release.json`，其中包含 commit SHA、生成时间、JobSpy snapshot SHA、n8n staging SHA、activeCount 和 canonicalCount；页面加载时校验同一 release。第六步，针对 Top30 使用严格坐标不移动原则，采用聚合/描边/交互展开解决同点重叠，并增加浏览器测试验证四个 tab 的实际 DOM。


## 十四、repost 规则纠正（2026-09-11 15:07 北京时间）

复核发现，原实现错误地把 `item.jobspyRepost is True` 与 24 小时窗口写成了两个同时成立的条件。该实现不符合要求，因为“JobSpy 运行时间晚于 `datePosted` 且不超过 24 小时”本身就是 repost 判定规则，不应再要求一个额外的 `jobspyRepost=true` 输入标记。

已在提交 `179b1e9` 修正并推送到远端 `main`：

```text
repost = observed_at > datePosted
          and observed_at - datePosted <= 24 hours
```

对于只有日期的 `datePosted`，仍按北京时间当天 00:00 解释；对于带时间和时区的值，按实际 elapsed time 判断。若条件成立，则用 JobSpy 的 `datePosted` 更新 canonical `pushTime`，并将 `jobspyRepost` 作为计算结果写入；若条件不成立，则不推进已有 `pushTime`。

本次同步把四个 repost 测试改为**不提供 `jobspyRepost=true`**，直接验证 24 小时规则；覆盖窗口内、恰好 24 小时、超过 24 小时和未来 `datePosted` 四种边界。专项测试 10 个、全量测试 20 个均通过。
