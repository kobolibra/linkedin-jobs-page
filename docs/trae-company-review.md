# TRAE company review: canonical scheduler entrypoint

GitHub main is the only source of business code and policy. The external
scheduler keeps only the bootstrap command and the AI research task. The
outer workspace provides the existing /workspace/config.json authentication
and proxy settings (or an injected GITHUB_TOKEN/GH_TOKEN secret); it is NOT a script, report, or module source.

## Scheduler script (Bash)

```bash
python3 -I -B - <<'PY'
import json, os, pathlib, subprocess, sys, tempfile, urllib.request
p = pathlib.Path("/workspace/config.json")
cfg = json.loads(p.read_text()) if p.exists() else {}
if cfg.get("repo", "kobolibra/linkedin-jobs-page") != "kobolibra/linkedin-jobs-page" or cfg.get("branch", "main") != "main":
    raise SystemExit("Wrong repository or branch")
token = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not token:
    raise SystemExit("Missing GitHub credential")
base = pathlib.Path("/workspace/next-journey-runs")
base.mkdir(parents=True, exist_ok=True)
run = pathlib.Path(tempfile.mkdtemp(prefix="run.", dir=base))
url = "https://api.github.com/repos/kobolibra/linkedin-jobs-page/contents/scripts/trae_bootstrap.py?ref=main"
req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github.raw+json"})
handlers = [urllib.request.ProxyHandler({"https": cfg["proxy"]})] if cfg.get("proxy") else []
with urllib.request.build_opener(*handlers).open(req, timeout=60) as response:
    script = run / "trae_bootstrap.py"
    script.write_bytes(response.read())
subprocess.run([sys.executable, "-I", "-B", str(script)], check=True)
PY
```

The authenticated API download and process-local HTTPS Git authentication support both public and private repositories, including subsequent fetches. Never put credentials into URLs, logs or task text.

## AI task contract（唯一任务规范）

每次成功启动后，只使用实际输出的 RUN_DIR、REPO_DIR、ENTRYPOINT。
读取本次 checkout 的 financial-blacklist.md 和以下规则。不得复用旧运行目录，
不得自行修改业务脚本或直接编辑名单。启动失败时报告真实错误并停止。
同一时间不要手动启动重叠的核验任务。

### 1. 只核验待办公司

打开 RUN_DIR/company-review-queue.json，只处理 reviewQueue，按已有顺序
（有效网页职位数优先）核验。deferredObservations 是等待新职位的历史记录，
不是待办。已确认公司和用户指定排除公司不重复核验；JobSpy 固定公司范围
不单独扫描。历史核验未果的公司只有出现尚未核验的新 LinkedIn 职位才重开，
重复抓取、时间状态变化和已识别的重发职位不重开。队列为空直接进入结束步骤。

### 2. 一家公司只调查一次

查明准确的招聘发布主体、实际主营业务及服务模式，一次调查同时完成
行业、保留/删除及必要的雇主类型判断。优先采用官网、监管机构、企业
LinkedIn 主页及原始职位证据，不凭公司名称或职位名称猜测。

- 金融、金融科技及符合项目范围的招聘服务公司：protect。
  自营业务招聘用 direct_employer；核心业务为代招聘、猎头、人才派遣、
  EOR、人力外包、RPO 用 recruitment_agency；招聘平台用 recruitment_platform。
- 加密货币、区块链公司及其他非目标行业公司：delete，加入累计目标名单。
  不给删除公司分配 employerType。加密关键词只是提示，实际行业需有证据；
  不把加密公司误认作受保护金融机构。
- 实际主体或业务证据不足：inconclusive，不新增删除或保护记录。
  记录具体未决问题，等待新职位，不反复进行同类搜索。

遵守 financial-blacklist.md 中的用户明确决定及原有业务规则。
不新增 mixed/unknown 保护分类，不擅自修改已确认公司的分类。
已有分类冲突留给维护者审核处理。

### 3. 一次提交调查结果

在 RUN_DIR 内保存 UTF-8 JSON 数组。每家公司一条记录，company 使用队列
原名。decision 只能为 protect、delete、inconclusive。已确认结果提供实际
industry、evidence（非空 HTTPS 来源及支持结论的说明）、queries（实际查询）。
protect 额外填写 employerType。inconclusive 填写 remainingQuestion、queries。
可用 summary 补充结论。脚本自动生成日期和内部保护记录，不重复填写证据。

示例仅说明格式，禁止提交示例公司、虚构证据或查询：

```json
[
  {"company":"示例银行","decision":"protect","industry":"银行","employerType":"direct_employer","evidence":[{"url":"https://example.com/about","note":"官网确认主体、业务及自身招聘模式"}],"queries":["实际查询"]},
  {"company":"示例交易所","decision":"delete","industry":"加密货币交易所","evidence":[{"url":"https://example.com/about","note":"官网确认主营加密货币交易服务"}],"queries":["实际查询"]},
  {"company":"示例未决公司","decision":"inconclusive","remainingQuestion":"无法确认具体招聘主体","queries":["实际查询"]}
]
```

完成一批即执行（变量必须替换为本次真实绝对路径）：

```bash
python3 -I -B "$ENTRYPOINT" apply-review --results "$RESULTS_FILE"
```

脚本在写入前验证全部结果，将分类、行业、累计名单、历史报告和核验进度
原子提交；只有明确核验的删除决定可新增删除名单。成功后重新读取当前
company-review-queue.json，继续剩余待办。无需重复 dry-run（仍支持作为诊断），
无需单独执行旧 reclassify、queue --write 或更新名单脚本。提交失败时检查
真实错误，修正结果；遇业务代码更新，保留研究文件并从最新 main 重新启动，
核对新队列后再提交。不要猜测提交是否成功；先核对 GitHub 记录。

### 4. 结束与报告

完成或达到任务时限后运行：

```bash
python3 -I -B "$ENTRYPOINT" finish
```

读取刷新后的 REPO_DIR/reports 目录，以 execution-manifest.json 的 reviewDay
选择当日 today-target-companies-YYYY-MM-DD.tsv 和
today-excluded-companies-YYYY-MM-DD.tsv。中文简明输出实际核验数量、
新增保护/删除公司及分类、未果、剩余待办和等待新职位的数量，附两份可复制 TSV。
日报中的待查证行不是已确认删除项；复制用的删除 TSV 只列累计目标名单已确认
条目，待查证另列。不能将已有分类的当日观察数量当成本次新核验数量。
报告提交及发布状态；PUBLICATION_STATE=current 仅代表输入已发布，
不是 Cloudflare 上线证明。pending 为等待发布，不是核验失败。
如缺少报告或验证失败，明确说明，不编造结果。不要修改 n8n blocklist、
Google Sheet、JobSpy 或前端，不输出凭证。旧版 apply-review JSON 格式与
refresh / publication --check / publish-audit 命令继续兼容，无需调整现有启动脚本。
