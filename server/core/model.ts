import { runtimeConfig } from './runtime-config'
import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { z } from 'zod'
import { AppError } from './store'
import { prompts } from './prompts'

export interface ModelPort {
  structured<T>(
    schema: z.ZodType<T>,
    stage: string,
    data: unknown,
    config?: RunnableConfig,
  ): Promise<T>
  call(
    messages: BaseMessage[],
    tools: StructuredToolInterface[],
    config?: RunnableConfig,
  ): Promise<BaseMessage>
}
export function configured() {
  const config = runtimeConfig().resolve()
  return !!(config.apiKey && config.model)
}
export function createModel(
  config = runtimeConfig().resolve(),
  limits: { timeout?: number; maxRetries?: number } = {},
): ModelPort {
  if (!config.apiKey || !config.model)
    throw new AppError(503, '请在设置页面配置 API Key 与 Model。')
  const protocol = config.protocol
  const model = new ChatOpenAI({
    useResponsesApi: protocol === 'responses',
    apiKey: config.apiKey,
    model: config.model,
    configuration: { baseURL: config.baseUrl },
    maxRetries: limits.maxRetries ?? 1,
    timeout: limits.timeout ?? 90000,
  })
  return {
    async structured<T>(
      schema: z.ZodType<T>,
      stage: string,
      data: unknown,
      config?: RunnableConfig,
    ): Promise<T> {
      const modelConfig = config
        ? {
            ...config,
            runName: `llm.${stage}`,
            metadata: { ...config.metadata, rolelensStage: stage },
          }
        : undefined
      const result = await model
        .withStructuredOutput(schema, { name: stage, method: 'functionCalling' })
        .invoke(
          [
            { role: 'system', content: prompts.structuredSystem(stage) },
            { role: 'user', content: JSON.stringify(data) },
          ],
          modelConfig,
        )
      return schema.parse(result)
    },
    async call(messages, tools, config) {
      const modelConfig = config
        ? {
            ...config,
            runName: 'llm.research',
            metadata: { ...config.metadata, rolelensStage: 'research' },
          }
        : undefined
      return model.bindTools(tools).invoke(messages, modelConfig)
    },
  }
}
export function redact(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐藏]')
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[电话已隐藏]')
}
