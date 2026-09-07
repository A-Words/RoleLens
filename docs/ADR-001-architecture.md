# ADR 001：本地 Nuxt 与持久化 Agent

状态：接受。

Nuxt 4 + TypeScript 提供页面，Nitro 提供 API。SQLite 保存领域数据，上传存 `.data/uploads`。LangGraph.js 管理分析、工具执行、追问中断、生成核验和保存；LangChain.js 提供 ChatOpenAI 与 tool。SQLite checkpointer 按 session ID 持久化图状态。

事实、草稿、来源、职位、会话、生成版本独立存储。确认和版本检查在事务内执行，避免重复确认或覆盖并发编辑。生成保存使用 session ID 稳定键。每次生成前重新读取允许使用的事实；来源工具只返回允许使用的事实摘录，不发送整份可能含联系方式的原始文档。来源全文仅在本地查看。

模型输出必须引用有效事实 ID；核验节点再次检查支持关系，发现问题则拒绝保存并允许重试。不能以引用存在等同事实可靠，UI 始终允许核对来源。外部资料视为数据，不可授予工具额外权限。

单进程本地部署，进程内拒绝同会话并发执行。重启后从检查点恢复。用户补充仅供当次任务解释使用；新增事实仍需通过草稿确认。确认/排除/删除会增加资料修订号，运行过程发生变更则要求重新开始，避免旧检查点使用已删除资料。

PDF 使用本地 Chromium 和内置中文字体，HTML 转义并禁用外部网络访问。模型配置只存在服务端环境。Git 仅提交源码、文档、锁文件和配置示例。

开发阶段 Agent tracing 是独立的、显式开启的可选能力：`@langfuse/langchain` CallbackHandler 随 LangGraph invocation 传递，`@langfuse/otel` 的 LangfuseSpanProcessor 负责 OpenTelemetry 导出，环境固定为 development。sessionId 和 jobId 只作为字符串 metadata 关联，不把 Langfuse Prompt Management 或原始 SQLite Trace 接入业务流程。初始化、上报和刷新失败均 fail-open，不改变 Agent 状态、checkpoint 或 `Store.trace`；导出前额外复用现有敏感信息脱敏规则。

参考：[Nuxt server](https://nuxt.com/docs/4.x/directory-structure/server)、[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、[Langfuse LangChain/LangGraph integration](https://langfuse.com/integrations/frameworks/langchain)。
