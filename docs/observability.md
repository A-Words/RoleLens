# Langfuse 开发观测

RoleLens 可选地把 Agent 的 LangGraph/LangChain 执行发送到 Langfuse，用于开发阶段排查模型、工具和耗时层级。它不是业务功能，不使用 Langfuse Prompt Management，也不会写入或替换本地 SQLite `traces`。

## 开启

只在本地开发环境显式开启：

```dotenv
ROLELENS_LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=development
```

同时必须满足 `NODE_ENV=development`。复制 `.env.example` 后填写本机 `.env`，重启 `npm run dev`。没有完整密钥、没有显式开启、不是 development，RoleLens 不会初始化 Langfuse。应用使用 `@langfuse/langchain` 的 `CallbackHandler`、`@langfuse/otel` 的 `LangfuseSpanProcessor` 和 OpenTelemetry `NodeSDK`；不需要本地 OTLP collector，也不会占用测试 fixture 使用的 4318 端口。

## 记录内容与隐私

每次 Agent API run 创建一个 Langfuse trace，使用 RoleLens `sessionId` 作为 Langfuse session，并将以下字符串 metadata 关联到 trace 和子观察：

- `langfuseSessionId`
- `rolelensSessionId`
- `rolelensJobId`

LangGraph callback 会展示 graph/node、模型调用、工具调用、输入输出、提供商返回的 token usage（如果模型返回）和耗时层级。中断后恢复或失败重试会创建新的 invocation，但仍按同一 session 和 job metadata 关联。

Langfuse 导出前会复用 RoleLens 的邮箱和大陆手机号脱敏规则，并遮盖明显的 API key、secret、password、authorization、cookie 和 token 字段。不要把密钥放进职位描述、资料或工具返回值；这层 mask 是额外保护，不是通用的 PII 识别器。开发者仍应使用合成或已清理的资料，并确认目标 Langfuse 项目的访问权限；配置云端 Langfuse 就表示允许开发中的模型输入输出发送到该实例。

## 与 SQLite 执行记录的区别

- SQLite `traces` 是 RoleLens 的本地业务执行记录，供职位页面展示检索、来源读取、追问、核验和保存事件。
- Langfuse 是独立的开发诊断输出，只通过 LangChain callback 和 OpenTelemetry 上报。
- 关闭 Langfuse 不会减少、改变或阻塞 SQLite 业务 Trace，也不会改变 Agent 的 checkpoint、重试和状态逻辑。

上报初始化、网络、callback 或 flush 失败都会被隔离，Agent 继续按原有逻辑执行。服务关闭时会尽力关闭 OpenTelemetry SDK，但关闭失败不会阻止进程退出。

## 官方文档

- [LangChain Tracing & LangGraph Integration](https://langfuse.com/integrations/frameworks/langchain)
- [Langfuse Environments](https://langfuse.com/docs/observability/features/environments)
- [Observability best practices](https://langfuse.com/docs/observability/best-practices)
- [JavaScript/TypeScript v4 → v5 upgrade path](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5)
