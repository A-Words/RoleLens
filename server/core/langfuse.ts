import { CallbackHandler } from '@langfuse/langchain'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { NodeSDK } from '@opentelemetry/sdk-node'
import type { RunnableConfig } from '@langchain/core/runnables'
import { redact } from './model'

type Environment = Readonly<Record<string, string | undefined>>
export type AgentTraceConfig = Pick<RunnableConfig, 'callbacks' | 'metadata' | 'tags' | 'runName'>
export type AgentTrace = { config: AgentTraceConfig; finish: () => Promise<void> }
export type AgentTracer = (input: { sessionId: string; jobId: string }) => AgentTrace | undefined

type Runtime = { sdk: NodeSDK; processor: LangfuseSpanProcessor }
let runtime: Runtime | undefined
let unavailable = false

export function isLangfuseEnabled(env: Environment = process.env) {
  return (
    env.ROLELENS_LANGFUSE_ENABLED === 'true' &&
    env.NODE_ENV === 'development' &&
    env.LANGFUSE_TRACING_ENVIRONMENT === 'development' &&
    !!env.LANGFUSE_PUBLIC_KEY &&
    !!env.LANGFUSE_SECRET_KEY
  )
}

const sensitiveKey =
  /(?:^|[-_])(api[-_]?key|secret|password|authorization|cookie|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|token)$/i
const usageKey = /(?:^|[-_])(input|output|prompt|completion|total)[-_]?tokens?$/i
const serializedSecret =
  /(?<![A-Za-z0-9_-])(["']?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|bearer[-_]?token|secret|password|token)["']?\s*[:=]\s*["']?)[^"'`,}\s]+/gi
const bearerSecret =
  /(\b(?:authorization|proxy-authorization)["']?\s*[:=]\s*["']?bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const apiKeyValue = /\b(?:sk|pk)-(?:[A-Za-z0-9]+-)?[A-Za-z0-9_-]{16,}\b/g

function maskTraceString(value: string) {
  return redact(value)
    .replace(bearerSecret, '$1[敏感字段已隐藏]')
    .replace(serializedSecret, '$1[敏感字段已隐藏]')
    .replace(apiKeyValue, '[敏感字段已隐藏]')
}

function isSensitiveKey(key: string) {
  return sensitiveKey.test(key) && !usageKey.test(key)
}

export function maskTraceData(data: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof data === 'string') return maskTraceString(data)
  if (typeof data === 'bigint') return String(data)
  if (data === null || typeof data !== 'object') return data
  if (data instanceof Uint8Array) return '[二进制内容已隐藏]'
  if (seen.has(data)) return '[循环引用已隐藏]'
  seen.add(data)
  if (Array.isArray(data)) return data.map((item) => maskTraceData(item, seen))
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? '[敏感字段已隐藏]' : maskTraceData(value, seen),
    ]),
  )
}

function getRuntime() {
  if (runtime || unavailable) return runtime
  try {
    const processor = new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || undefined,
      environment: 'development',
      timeout: 2,
      mask: ({ data }) => maskTraceData(data),
    })
    const sdk = new NodeSDK({ instrumentations: [], spanProcessors: [processor] })
    sdk.start()
    runtime = { sdk, processor }
  } catch {
    unavailable = true
  }
  return runtime
}

export const langfuseAgentTracer: AgentTracer = ({ sessionId, jobId }) => {
  if (!isLangfuseEnabled()) return undefined
  const active = getRuntime()
  if (!active) return undefined
  try {
    const metadata = {
      langfuseSessionId: sessionId,
      rolelensSessionId: sessionId,
      rolelensJobId: jobId,
    }
    const handler = new CallbackHandler({
      sessionId,
      tags: ['rolelens', 'agent', 'development'],
      traceMetadata: metadata,
    })
    return {
      config: {
        callbacks: [handler],
        metadata,
        tags: ['rolelens', 'agent', 'development'],
        runName: 'rolelens-agent',
      },
      async finish() {
        try {
          await active.processor.forceFlush()
        } catch {
          // Observability must not change the Agent result.
        }
      },
    }
  } catch {
    return undefined
  }
}

export async function shutdownLangfuse() {
  const active = runtime
  runtime = undefined
  if (!active) return
  try {
    await active.sdk.shutdown()
  } catch {
    // Observability must not prevent the server from shutting down.
  }
}
