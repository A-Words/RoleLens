import { HumanMessage } from '@langchain/core/messages'
import { createModel } from './model'
import { runtimeConfig, type RuntimeConfigProvider } from './runtime-config'
import type { ConnectionTestResult } from '../../shared/settings'

export async function testConnection(
  provider: RuntimeConfigProvider = runtimeConfig(),
): Promise<ConnectionTestResult> {
  const start = Date.now()
  const signal = AbortSignal.timeout(15000)
  const result = (ok: boolean, message: string) => ({ ok, message, durationMs: Date.now() - start })
  try {
    const config = provider.resolve()
    if (!config.apiKey || !config.model)
      return result(false, '请先配置 API Key 和 Model，再测试连接。')
    const model = createModel(config, { timeout: 15000, maxRetries: 0 })
    const response = await model.call([new HumanMessage('Reply with only OK.')], [], {
      signal,
      callbacks: [],
    })
    const content = response.content
    const hasText =
      typeof content === 'string'
        ? !!content.trim()
        : content.some(
            (block) =>
              block.type === 'text' && typeof block.text === 'string' && !!block.text.trim(),
          )
    return hasText
      ? result(true, '连接成功，当前生效配置已收到模型回复。')
      : result(false, '服务已响应，但未返回文本。请检查 Model 与 Protocol 是否匹配。')
  } catch (error) {
    // Never forward provider messages, response bodies or credentials to the UI/logs.
    const status = (error as { status?: number } | null)?.status
    const name = (error as { name?: string } | null)?.name ?? ''
    if (status === 401 || status === 403)
      return result(false, '认证或权限失败，请检查当前生效的 API Key 和模型访问权限。')
    if (status === 429) return result(false, '服务限流或额度不足，请检查账户状态后重试。')
    if (status === 400 || status === 404 || status === 422)
      return result(false, '请求不被服务支持，请检查 Base URL、Model 和 Protocol。')
    if (signal.aborted || /timeout|abort/i.test(name))
      return result(false, '连接测试超时（15 秒），请检查服务地址与网络后重试。')
    return result(false, '连接未成功，请检查当前生效配置、网络与服务状态后重试。')
  }
}
