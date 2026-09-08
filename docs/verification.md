# 验证记录

## 2026-09-08 Local-first 运行时配置

- 类型检查、38 项单元/集成测试和生产构建通过；现有 4 项端到端测试通过（本地模型 fixture）。
- 新增运行时配置测试覆盖默认值、持久化、密钥保留/删除、响应不回显密钥、环境 override、非法 URL/协议、Hosted Mode 拒绝以及配置与密钥事务回滚。
- 隔离数据目录、无 .env 的生产服务实际验证设置页保存、刷新、密钥输入清空、读取接口只返回配置状态；跨站 PUT /api/settings 返回 403。
- 模型支持 OpenAI / OpenAI-compatible 的 chat-completions 与 responses。未重新调用真实云端模型或 Langfuse，供应商与云端追踪效果仍需实际配置后验证。Langfuse 保持可选开发工具，修改提示重启生效。

## 2026-09-08 Langfuse 开发观测

- 新增可选 Langfuse v5/OpenTelemetry tracing：默认关闭，仅 `ROLELENS_LANGFUSE_ENABLED=true`、`NODE_ENV=development`、development environment 和完整密钥同时满足时初始化。
- `npm run typecheck`、`npm test`（34 项）、`npm run build` 和 `npm run test:e2e`（4 项）通过；无 Langfuse 密钥时测试不建立网络上报，现有 SQLite 业务 Trace 与 Agent checkpoint 流程保持不变。
- 新增 trace-only 脱敏测试，覆盖邮箱、手机号及明显凭据字段；新增 callback config 测试，确认 session/job metadata 传入模型节点并在 Agent finally 中独立刷新。
- 未配置真实 Langfuse 项目，因此尚未进行云端 trace UI 的人工验收。配置开发项目后应使用已清理或合成资料，检查 graph、LLM、tool、输入输出、token usage、耗时层级及 development environment。

日期：2026-09-08。环境：Windows、Node.js 24.18.1、Nuxt 4.5.2、Langfuse 5.11.0。

## 2026-09-07 使用流程修复

- 自动带入启用的基础档案；测试覆盖学历无 JD 关键词时仍进入分析，以及排除资料和联系方式不进入提示。
- 核验将阻断问题与说明分开；测试验证非空说明不阻断保存，失败重试收到上版草稿与具体问题。
- 来源分组、正文展开、失败详情、日志折叠、追问草稿返回入口、会话与生成版本联动、刷新后的运行状态轮询。
- 类型检查、26 项单元/集成测试和生产构建通过；3 项生产浏览器测试通过，覆盖导入、确认、追问、编辑、中文 PDF、筛选及移动导航。之后调整大资料库默认折叠规则，已用开发服务实际 74 条资料页面核对，并再次类型检查。
- 真实资料仅作本地只读界面检查，没有重新调用云端模型，也没有修改或合并资料。新的真实模型核验效果仍需后续使用验证。

日期：2026-09-05。环境：Windows、Node.js 24.18.1、Nuxt 4.5.2、Nuxt UI 4.11.0。使用合成测试资料和隔离数据目录，无用户个人资料。

## Nuxt UI 迁移

资料库、职位列表、职位详情和简历编辑器已使用 Nuxt UI 重写。Dashboard 组件提供侧栏、顶栏及移动端导航；Form、Modal、Slideover、Tabs、Select、FileUpload 和 Toast 承担交互。颜色通过 Nuxt UI 语义主题配置，支持浅色和深色模式，本地加载 Noto Sans SC 与 Lucide 图标。

已删除旧设计参考图片和视觉规范，移除原有手写控件 CSS 与 lucide-vue-next 依赖。本次迁移未使用 Image Gen。领域 API、Agent 图和 PDF 模板保持原有实现。

## 验证结果

- `npm run typecheck`：通过。
- `npm test`：3 个文件、14 项通过。
- `npm run build`：通过，Nitro node-server 产物可启动。
- `npm run test:e2e`：3 项通过，在生产构建上执行。
- `npm run format:check`：通过。

单元与集成测试覆盖：草稿确认与重复确认拒绝；编辑版本冲突；对话修改仅生成草稿；排除、联系方式与删除资料不进入检索；SQLite 关闭重开后恢复追问；不同 JD 检索不同项目；模型失败后重试；核验失败拒绝保存；并发执行拒绝；中断检查点恢复；生成幂等与历史事实快照；中文文档提取和长 PDF 分页。

浏览器完整路径：上传 Markdown → 确认入库 → 刷新仍存在 → 创建职位 → 分析与工具执行 → 刷新恢复追问 → 回答 → 生成 → 手动编辑并保存 → 下载 PDF → 提取中文确认内容和页数 → 移动端检查 → 删除版本并刷新确认不再出现。

新增 UI 回归覆盖：空表单校验、保存草稿后自动切换标签、搜索和类别组合筛选、编辑排除状态、版本抽屉的 Escape 关闭与焦点返回、深色模式刷新持久化、手机侧栏导航和自动关闭。另验证跨站写入与非法输入被拒绝。回归发现并修复了刷新追问后输入框标签关联问题。

内置浏览器检查了当前开发服务的空库、响应式侧栏与职位导航。使用实际渲染截图核对桌面 1505 × 1045 和移动端 390 × 844，未发现横向溢出；完整流程未出现浏览器页面异常。Dashboard 内容区域独立滚动，截图展示当前视口。

截图：[资料库](screenshots/library-desktop.png)、[职位详情](screenshots/job-desktop.png)、[移动端](screenshots/job-mobile.png)、[深色模式](screenshots/library-dark.png)。

## 覆盖边界

本机未配置真实云端模型，因此未验证供应商兼容性、生成质量及事实核验准确率。模拟服务通过真实 LangChain HTTP 适配器和 LangGraph 检查点、工具流程验证应用行为，不能作为真实模型效果证明。

PDF 使用 Chromium 实际导出并解析；中文内容与目标页数通过断言，长内容测试确认末尾条目仍存在，未做逐页 PDF 人工校对。截图中的生成文本来自确定性模拟服务，仅用于验证界面与流程。
