# RoleLens

个人本地求职工作台。维护有来源、可确认和可编辑的经历库，再根据 JD 生成中文打招呼语与 PDF 简历。

技术栈：Nuxt 4、Nuxt UI 4、TypeScript、Nitro、LangGraph.js、LangChain.js、SQLite。

## 启动

推荐 Node.js 24 LTS。已有依赖和模型配置时，在仓库根目录直接启动：

```powershell
npm run dev
```

首次克隆项目时才需要安装依赖；首次配置模型时复制配置示例，不要覆盖已有 `.env`：

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

编辑本机 `.env`，填写 `ROLELENS_API_KEY`、`ROLELENS_MODEL`，需要时设置 `ROLELENS_BASE_URL`，然后运行 `npm run dev`。模型必须支持工具调用与结构化输出。`ROLELENS_API_PROTOCOL` 默认 `chat-completions`；供应商要求 Responses API 时设为 `responses`。BASE_URL 保留到 `/v1`，无需附加 `/responses` 或 `/chat/completions`。修改配置后重启应用。RoleLens 不主动使用 LangSmith；如需开发阶段 Agent tracing，见 [Langfuse 开发观测](docs/observability.md)，仅在 `NODE_ENV=development` 且显式开启并配置密钥时启用。

例如 OpenCode Go 的 `gpt-5.6-luna` 使用 `responses`，具体模型的端点以[供应商文档](https://opencode.ai/docs/go/)为准。模型列表可访问不代表生成接口可用；协议、模型权限和供应商地区支持均会影响调用。

打开 [本地工作台](http://127.0.0.1:3000)。没有模型配置时，可以手动录入和确认资料；AI 导入、分析和生成需要配置模型。应用没有内置演示模型或自动降级假结果。

启动网页不需要安装 Chromium。首次导出 PDF 或运行相关测试前，若尚未安装项目所用的 Chromium，再执行：

```powershell
npx playwright install chromium
```

依赖安装和浏览器安装都不必在每次启动前重复执行；更新 Playwright 版本后可能需要安装对应的 Chromium。

生产运行仍在仓库根目录，保留已安装依赖：

```powershell
npm run build
npm start
```

启动脚本读取本机 `.env` 并绑定 `127.0.0.1`。本产品没有账号认证，不支持公网暴露或多进程部署。

## 使用

1. 在资料库上传文字型 PDF、DOCX、Markdown、TXT（10 MB、60000 字以内），或通过对话补充。导入阶段会把提供的文本发给配置的模型，请先移除无关敏感内容。
2. 在“待确认草稿”中核对类别、标题、正文和“允许用于生成”，确认入库。“已确认资料”按导入来源分组，支持搜索和类别筛选、展开长正文；同一项目的不同来源仍独立保留，不自动合并。对话修改已有经历时，选择目标资料；修改也先生成草稿。
3. 在职位工作台填写公司、职位、JD，开始分析。Agent 调用资料检索与来源工具，展示匹配依据。
4. 回答追问或跳过。补充中的新事实需要先整理成草稿并确认，再重新分析；不能绕过事实确认。
5. 审阅生成内容、查看当时的事实版本，编辑后保存，复制招呼语或下载 PDF。手动编辑不会自动再次通过模型核验。下载使用已保存版本。

分析自动带入启用的个人背景、教育和求职偏好，项目经历按关键词检索。核验区分阻断问题与说明；失败时在职位页直接列出问题，“从检查点重试”会携带上一版草稿和核验意见重新生成。“重新分析”会建立新任务并重新检索；想纠正旧分析中的资料遗漏时，请使用重新分析。职位追问生成草稿后会进入待确认标签，并提供返回原职位入口。

联系方式类别不进入 JD 分析与生成提示，启用的联系方式由本地加入 PDF。其他事实中的常见邮箱与大陆手机号在生成调用前脱敏；这不等于自动识别所有敏感信息，请核对资料分类与正文。

资料变化会使旧的未完成分析失效，需要重新分析。删除资料使其不再用于后续生成；已有来源、版本历史与简历保留。旧简历绑定生成时的事实快照，可单独删除简历版本。

## 数据与维护

默认 `.data/rolelens.sqlite` 保存领域数据及 LangGraph 检查点，`.data/uploads/` 保存上传文件。可用 `ROLELENS_DATA_DIR` 设置绝对目录。备份前停止应用，再备份整个数据目录；这是本机明文存储。

密钥、`.env`、SQLite 及其 WAL 文件、上传文件、生成文件、测试运行数据均不提交 Git。`.env.example` 仅包含空值和公共默认地址。不要将数据目录改到受版本控制的位置。

图执行记录显示实际检索、来源读取、追问、核验和保存。单会话同时只允许一次执行，生成保存按会话幂等。模型失败时可从检查点重试；资料变更后应新建分析。

## 验证

### 查看错误

服务端异常会在页面及 F12 的响应中提供错误编号，并在运行 `npm run dev` / `npm start` 的终端输出同编号诊断。日志也保存到数据目录的 `logs/errors-YYYY-MM-DD.jsonl`，默认在 `.data/logs/`。可以用 `Get-Content .data/logs/errors-*.jsonl -Tail 20` 查看最近记录。

记录包含时间、失败阶段、异常类型、上游状态码及排查建议；不记录密钥、请求正文、简历内容或 SDK 原始错误消息。`import.extract_text` 表示文件解析阶段，`import.generate_drafts` 表示调用模型整理草稿或保存草稿阶段。旧错误无法追溯，需要更新后重试一次。日志按天分文件，可按需删除；当前不自动清理。

本地使用无需接入 Sentry。若以后部署给多人使用，再考虑集中错误监控，并配置个人资料脱敏和上传范围。

```powershell
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run format:check
```

单元与集成测试通过注入模拟模型运行真实 LangGraph。浏览器测试启动独立本地 OpenAI 兼容模拟服务，走真实 LangChain HTTP 请求，使用隔离的 `.qa/` 数据目录，不读取或写入个人资料库。需空闲端口 3100、4318。

模拟测试验证流程、数据边界和 UI，不证明真实模型的生成质量或事实核验能力。真实 API 配置与效果需另行验收。

详细决策见 [PRD](docs/PRD.md)、[架构决策](docs/ADR-001-architecture.md)、[验证记录](docs/verification.md)。
