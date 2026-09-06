import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Allowlisted metadata only: SDK messages/bodies can contain resumes and credentials.
export function describeFailure(error: unknown) {
  const chain: { type: string; status?: number; code?: string }[] = []
  let current = error
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') break
    const e = current as { name?: unknown; status?: unknown; code?: unknown; cause?: unknown }
    chain.push({
      type:
        typeof e.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(e.name)
          ? e.name
          : 'Error',
      ...(typeof e.status === 'number' ? { status: e.status } : {}),
      ...(typeof e.code === 'string' &&
      /^(?:E[A-Z_]+|invalid_api_key|model_not_found|insufficient_quota|rate_limit_exceeded)$/.test(
        e.code,
      )
        ? { code: e.code }
        : {}),
    })
    current = e.cause
  }
  const status = chain.find((e) => e.status)?.status
  const types = chain.map((e) => e.type).join(' ')
  const hint =
    status === 401 || status === 403
      ? '模型服务拒绝鉴权，请检查密钥及模型访问权限。'
      : status === 429
        ? '模型服务限流或额度不足，请检查账户额度并稍后重试。'
        : status === 404
          ? '模型或 API 路径不存在，请检查模型名称和 BASE_URL。'
          : status === 400
            ? '模型服务拒绝请求，请检查模型是否支持工具调用及结构化输出。'
            : status && status >= 500
              ? `模型服务返回 ${status}，请稍后重试或检查供应商服务状态。`
              : /Timeout|Connection/.test(types) || chain.some((e) => e.code?.startsWith('E'))
                ? '连接失败或超时，请检查本机网络、代理和服务地址。'
                : /OutputParser|Zod/.test(types)
                  ? '模型返回内容不符合预期格式，请检查结构化输出支持或重试。'
                  : '请根据错误编号查看本机诊断日志。'
  return { chain, hint }
}

export function reportFailure(error: unknown, stage: string) {
  const { chain, hint } = describeFailure(error)
  const errorId = randomUUID()
  const record = { time: new Date().toISOString(), errorId, stage, hint, chain }
  const line = JSON.stringify(record)
  console.error('[RoleLens]', line)
  try {
    const directory = resolve(process.env.ROLELENS_DATA_DIR || '.data', 'logs')
    mkdirSync(directory, { recursive: true })
    appendFileSync(resolve(directory, `errors-${record.time.slice(0, 10)}.jsonl`), line + '\n')
  } catch {
    console.error('[RoleLens] 诊断日志写入失败，请检查数据目录权限；诊断记录已输出到终端。')
  }
  return { errorId, hint }
}
