import { afterEach, describe, expect, it, vi } from 'vitest'
const { constructor } = vi.hoisted(() => ({ constructor: vi.fn() }))
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(options: unknown) {
      constructor(options)
    }
  },
}))
import { configured, createModel } from '../server/core/model'

afterEach(() => {
  vi.unstubAllEnvs()
  constructor.mockClear()
})
describe('model API protocol', () => {
  function setup() {
    vi.stubEnv('ROLELENS_API_KEY', 'test-key')
    vi.stubEnv('ROLELENS_MODEL', 'test-model')
  }
  it('keeps model status and creation available with invalid optional tracing', () => {
    setup()
    vi.stubEnv('LANGFUSE_BASE_URL', 'not-a-url')
    vi.stubEnv('ROLELENS_LANGFUSE_ENABLED', 'invalid')
    expect(configured()).toBe(true)
    createModel()
    expect(constructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key', model: 'test-model' }),
    )
  })
  it.each([
    ['', false],
    ['chat-completions', false],
    ['responses', true],
  ])('routes %s explicitly', (protocol, expected) => {
    setup()
    vi.stubEnv('ROLELENS_API_PROTOCOL', protocol)
    createModel()
    expect(constructor).toHaveBeenCalledWith(expect.objectContaining({ useResponsesApi: expected }))
    const options = constructor.mock.calls[0]![0]
    expect(options).not.toHaveProperty('temperature')
  })
  it('rejects an unknown protocol before sending requests', () => {
    setup()
    vi.stubEnv('ROLELENS_API_PROTOCOL', 'typo')
    expect(createModel).toThrow('ROLELENS_API_PROTOCOL')
    expect(constructor).not.toHaveBeenCalled()
  })
})
