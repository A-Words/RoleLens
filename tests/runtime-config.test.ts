import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { LocalConfigProvider, deploymentMode } from '../server/core/runtime-config'

describe('local runtime configuration', () => {
  it.each([
    ['development', 'false', 'not-a-url'],
    ['production', 'true', 'not-a-url'],
    ['development', 'true', 'not-a-url'],
    ['development', 'invalid', 'https://cloud.langfuse.com'],
  ])('disables invalid tracing in %s with enabled=%s and URL=%s', (nodeEnv, enabled, url) => {
    const db = new Database(':memory:')
    try {
      const provider = new LocalConfigProvider(db, {
        NODE_ENV: nodeEnv,
        ROLELENS_API_KEY: 'model-secret',
        ROLELENS_MODEL: 'working-model',
        ROLELENS_LANGFUSE_ENABLED: enabled,
        LANGFUSE_BASE_URL: url,
        LANGFUSE_PUBLIC_KEY: 'trace-public',
        LANGFUSE_SECRET_KEY: 'trace-secret',
      })
      expect(provider.resolve()).toMatchObject({
        model: 'working-model',
        apiKey: 'model-secret',
        langfuseEnabled: false,
        langfuseAvailable: false,
      })
      expect(provider.view().configured).toBe(true)
      expect(provider.save({ model: 'saved-model' }).settings.model).toBe('saved-model')
      expect(() => provider.save({ langfuseBaseUrl: 'not-a-url' })).toThrow()
    } finally {
      db.close()
    }
  })
  it('persists secrets separately, preserves and deletes without exposing them', () => {
    const db = new Database(':memory:')
    const provider = new LocalConfigProvider(db, {})
    expect(provider.view().configured).toBe(false)
    const view = provider.save({ model: 'test', apiKey: 'sensitive-value' })
    expect(view.configured).toBe(true)
    expect(JSON.stringify(view)).not.toContain('sensitive-value')
    expect(JSON.stringify(db.prepare('SELECT * FROM local_settings').all())).not.toContain(
      'sensitive-value',
    )
    const reopened = new LocalConfigProvider(db, {})
    reopened.save({ model: 'next' })
    expect(reopened.resolve().apiKey).toBe('sensitive-value')
    reopened.save({ model: 'next', apiKey: null })
    expect(reopened.view().configured).toBe(false)
    db.close()
  })
  it('resolves overrides and reports only field names', () => {
    const db = new Database(':memory:')
    const provider = new LocalConfigProvider(db, {
      ROLELENS_API_KEY: 'env-secret',
      ROLELENS_MODEL: 'override',
      ROLELENS_LANGFUSE_ENABLED: 'false',
    })
    provider.save({ model: 'saved', langfuseEnabled: true })
    expect(provider.resolve().model).toBe('override')
    expect(provider.resolve().langfuseEnabled).toBe(false)
    expect(provider.view().settings.model).toBe('saved')
    expect(provider.view().overrides).toContain('apiKey')
    expect(JSON.stringify(provider.view())).not.toContain('env-secret')
    db.close()
  })
  it('validates before mutation and refuses credential-bearing URLs', () => {
    const db = new Database(':memory:')
    const provider = new LocalConfigProvider(db, {})
    provider.save({ apiKey: 'original' })
    expect(() =>
      provider.save({ apiKey: 'replacement', baseUrl: 'https://key:secret@example.com' }),
    ).toThrow()
    expect(provider.resolve().apiKey).toBe('original')
    expect(() => provider.save({ protocol: 'invalid' })).toThrow()
    expect(() => provider.save({ baseUrl: 'not-a-url' })).toThrow('Invalid URL')
    expect(() => deploymentMode({ ROLELENS_MODE: 'hosted' })).toThrow('Hosted')
    db.close()
  })
  it('rolls back settings and secrets when effective configuration is invalid', () => {
    const db = new Database(':memory:')
    const env = { ROLELENS_API_PROTOCOL: '' }
    const provider = new LocalConfigProvider(db, env)
    provider.save({ model: 'original', apiKey: 'original-secret' })
    env.ROLELENS_API_PROTOCOL = 'invalid'
    expect(() => provider.save({ model: 'changed', apiKey: 'changed-secret' })).toThrow()
    env.ROLELENS_API_PROTOCOL = ''
    expect(provider.resolve().model).toBe('original')
    expect(provider.resolve().apiKey).toBe('original-secret')
    db.close()
  })
})
