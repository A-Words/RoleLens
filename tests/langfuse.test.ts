import { afterEach, describe, expect, test, vi } from 'vitest'
import { isLangfuseEnabled, langfuseAgentTracer, maskTraceData } from '../server/core/langfuse'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Langfuse development gate', () => {
  test('requires explicit development configuration and both keys', () => {
    expect(
      isLangfuseEnabled({
        ROLELENS_LANGFUSE_ENABLED: 'true',
        NODE_ENV: 'development',
        LANGFUSE_TRACING_ENVIRONMENT: 'development',
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
      }),
    ).toBe(true)
    expect(
      isLangfuseEnabled({
        ROLELENS_LANGFUSE_ENABLED: 'true',
        NODE_ENV: 'production',
        LANGFUSE_TRACING_ENVIRONMENT: 'development',
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
      }),
    ).toBe(false)
    expect(
      isLangfuseEnabled({
        ROLELENS_LANGFUSE_ENABLED: 'true',
        NODE_ENV: 'development',
        LANGFUSE_TRACING_ENVIRONMENT: 'development',
        LANGFUSE_PUBLIC_KEY: 'pk-test',
      }),
    ).toBe(false)
  })

  test('does not create a trace when disabled', () => {
    vi.stubEnv('ROLELENS_LANGFUSE_ENABLED', 'false')
    expect(langfuseAgentTracer({ sessionId: 'session-1', jobId: 'job-1' })).toBeUndefined()
  })
})

test('masks trace data without mutating the source', () => {
  const input = {
    email: 'person@example.com',
    phone: '13800138000',
    credentials: { apiKey: 'secret-value' },
    token: 'bare-secret',
    serialized:
      '{"token":"inline-secret","authorization":"Bearer abc.def.ghi","api_key":"sk-proj-1234567890123456"}',
    usage: { input_tokens: 12, output_tokens: 8 },
    nested: ['keep', { authorization: 'Bearer secret' }],
  }
  const masked = maskTraceData(input) as typeof input
  expect(masked).toEqual({
    email: '[邮箱已隐藏]',
    phone: '[电话已隐藏]',
    credentials: { apiKey: '[敏感字段已隐藏]' },
    token: '[敏感字段已隐藏]',
    serialized:
      '{"token":"[敏感字段已隐藏]","authorization":"Bearer [敏感字段已隐藏]","api_key":"[敏感字段已隐藏]"}',
    usage: { input_tokens: 12, output_tokens: 8 },
    nested: ['keep', { authorization: '[敏感字段已隐藏]' }],
  })
  expect(input.email).toBe('person@example.com')
  expect(input.credentials.apiKey).toBe('secret-value')
})
