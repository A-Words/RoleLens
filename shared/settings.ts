import { z } from 'zod'

const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  }, '地址必须是 HTTP(S)，且不能包含凭据、查询参数或片段')
export const settingsSchema = z
  .object({
    provider: z.enum(['openai', 'openai-compatible']).default('openai-compatible'),
    baseUrl: endpoint.default('https://api.openai.com/v1'),
    model: z.string().trim().max(200).default(''),
    protocol: z.enum(['chat-completions', 'responses']).default('chat-completions'),
    langfuseEnabled: z.boolean().default(false),
    langfuseBaseUrl: endpoint.default('https://cloud.langfuse.com'),
  })
  .strict()
export const secretNames = ['apiKey', 'langfusePublicKey', 'langfuseSecretKey'] as const
export type SecretName = (typeof secretNames)[number]
export type Settings = z.infer<typeof settingsSchema>
const secret = z.string().trim().min(1).max(4096).nullable().optional()
export const settingsWriteSchema = settingsSchema.extend({
  apiKey: secret,
  langfusePublicKey: secret,
  langfuseSecretKey: secret,
})
export type SettingsView = {
  mode: 'local'
  settings: Settings
  effectiveSettings: Settings
  configured: boolean
  secrets: Record<SecretName, boolean>
  overrides: string[]
  langfuseAvailable: boolean
  langfuseRestartRequired: boolean
}
export type ConnectionTestResult = { ok: boolean; message: string; durationMs: number }
