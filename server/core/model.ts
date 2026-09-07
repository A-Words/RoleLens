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
  return !!(process.env.ROLELENS_API_KEY && process.env.ROLELENS_MODEL)
}
export function createModel(): ModelPort {
  if (!configured())
    throw new AppError(503, '请在本机 .env 配置 ROLELENS_API_KEY 与 ROLELENS_MODEL，然后重启应用。')
  const protocol = process.env.ROLELENS_API_PROTOCOL || 'chat-completions'
  if (!['chat-completions', 'responses'].includes(protocol))
    throw new AppError(503, 'ROLELENS_API_PROTOCOL 必须为 chat-completions 或 responses。')
  const model = new ChatOpenAI({
    useResponsesApi: protocol === 'responses',
    apiKey: process.env.ROLELENS_API_KEY,
    model: process.env.ROLELENS_MODEL,
    configuration: { baseURL: process.env.ROLELENS_BASE_URL || 'https://api.openai.com/v1' },
    maxRetries: 1,
    timeout: 90000,
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
