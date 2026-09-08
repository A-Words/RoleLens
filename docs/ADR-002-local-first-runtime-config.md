# ADR 002：Local-first 与运行时配置

状态：接受。RoleLens 是 local-first 的个人求职 Agent。

部署概念分为 Local Mode 与 Hosted Mode。目前只支持 Local Mode：单用户、无需账号、127.0.0.1、单进程、SQLite 与本地文件。Hosted Mode 仅为替换边界，不实现认证、多用户、多租户或 PostgreSQL；选择 hosted 必须明确失败，不能误用本地存储。

Nitro 的 RuntimeConfigProvider 统一解析模型和可选 Langfuse 配置。优先级为非空环境 override > 本地保存值 > 默认值。环境变量保留旧名称以兼容开发流程；设置页显示被覆盖的字段。日常使用无需 .env；部署模式、数据目录属于启动配置。

LocalConfigProvider 保存非密钥设置及 secret reference，通过 SecretStore 读取密钥。第一版 SecretStore 在本地 SQLite 明文保存，依赖操作系统账户和数据目录权限；不是加密保险库，备份也包含密钥。配置与密钥在同一事务中更新。以后可替换为系统凭据存储或 Hosted secret storage；跨存储事务需由对应实现处理。未来 Hosted provider 从可信服务端上下文解析用户/租户作用域，不能接受浏览器传入的租户标识作为授权依据。

设置 API 只返回非密钥配置、是否已配置密钥、override 字段名；不返回完整或部分密钥。密钥写入省略表示保留，null 表示删除，非空字符串表示替换。前端输入仅在提交期间存在，不写入浏览器持久化存储，提交完成清空。URL 禁止内嵌凭据、查询串和片段。现有本机 Host/Origin 防护覆盖设置 API。

模型在任务开始时取得配置快照，保存后下次任务生效。Langfuse 为显式开启的可选开发工具，保持 development 门控和 fail-open；首次创建实例后配置固定，变更需要重启，避免影响进行中的 trace。未配置不影响正常使用。Local-first 不代表离线：模型与显式开启的追踪仍可向配置的远端服务发送数据。
