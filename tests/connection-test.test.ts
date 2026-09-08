import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Database from 'better-sqlite3'
import { it, expect } from 'vitest'
import { LocalConfigProvider } from '../server/core/runtime-config'
import { testConnection } from '../server/core/connection-test'

async function fixture(
  protocol: 'chat-completions' | 'responses',
  status = 200,
  empty = false,
  stall = false,
) {
  const requests: { path: string; body: any; authorization?: string }[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({
      path: req.url!,
      body: JSON.parse(body),
      authorization: req.headers.authorization,
    })
    if (stall) return
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = status
    res.end(
      JSON.stringify(
        status !== 200
          ? { error: { message: 'upstream echoed private-test-key', type: 'error' } }
          : protocol === 'responses'
            ? {
                id: 'resp_probe',
                object: 'response',
                status: 'completed',
                model: 'effective-model',
                output: [
                  {
                    id: 'msg_probe',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [{ type: 'output_text', text: empty ? '' : 'OK', annotations: [] }],
                  },
                ],
              }
            : {
                id: 'probe',
                object: 'chat.completion',
                model: 'effective-model',
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: empty ? '' : 'OK' },
                  },
                ],
              },
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const db = new Database(':memory:')
  const provider = new LocalConfigProvider(db, {
    ROLELENS_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    ROLELENS_API_KEY: 'private-test-key',
    ROLELENS_MODEL: 'effective-model',
    ROLELENS_API_PROTOCOL: protocol,
  })
  provider.save({ model: 'local-backup' })
  return {
    requests,
    provider,
    close: async () => {
      db.close()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

it.each(['chat-completions', 'responses'] as const)(
  'tests effective %s configuration using a real SDK request',
  async (protocol) => {
    const f = await fixture(protocol)
    try {
      expect((await testConnection(f.provider)).ok).toBe(true)
      expect(f.requests).toHaveLength(1)
      expect(f.requests[0]?.path).toBe(
        protocol === 'responses' ? '/v1/responses' : '/v1/chat/completions',
      )
      expect(f.requests[0]?.body.model).toBe('effective-model')
      expect(f.requests[0]?.authorization).toBe('Bearer private-test-key')
      expect(f.provider.view().settings.model).toBe('local-backup')
    } finally {
      await f.close()
    }
  },
)
it.each([401, 404, 429, 500])('sanitizes HTTP %s and does not retry', async (status) => {
  const f = await fixture('chat-completions', status)
  try {
    const result = await testConnection(f.provider)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private-test-key')
    expect(f.requests).toHaveLength(1)
  } finally {
    await f.close()
  }
})
it('does not report an empty model response as successful', async () => {
  const f = await fixture('chat-completions', 200, true)
  try {
    expect((await testConnection(f.provider)).message).toContain('未返回文本')
  } finally {
    await f.close()
  }
})
it('bounds a stalled request and reports timeout', async () => {
  const f = await fixture('chat-completions', 200, false, true)
  try {
    expect((await testConnection(f.provider)).message).toContain('超时')
    expect(f.requests).toHaveLength(1)
  } finally {
    await f.close()
  }
}, 20000)
