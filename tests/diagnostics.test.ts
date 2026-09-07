import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeFailure, reportFailure } from '../server/core/diagnostics'

describe('local diagnostics', () => {
  it('reports known rejected parameters without exposing arbitrary values', () => {
    expect(describeFailure({ status: 400, param: 'temperature' }).hint).toContain('temperature')
    expect(JSON.stringify(describeFailure({ status: 400, param: 'private resume' }))).not.toContain(
      'private resume',
    )
  })
  it('identifies upstream internal errors', () => {
    expect(
      describeFailure(Object.assign(new Error('Internal server error'), { status: 500 })).hint,
    ).toContain('模型服务返回 500')
  })
  it('does not classify native module loading failures as network failures', () => {
    const result = describeFailure({ code: 'ERR_DLOPEN_FAILED' })
    expect(result.hint).toContain('本地原生依赖加载失败')
    expect(result.hint).not.toContain('网络')
  })
  it('only classifies allowlisted transport errors as network failures', () => {
    expect(describeFailure({ code: 'ECONNRESET' }).hint).toContain('连接失败或超时')
    expect(describeFailure({ code: 'EACCES' }).hint).not.toContain('连接失败或超时')
  })
  it('classifies nested provider failures without serializing private payloads', () => {
    const cause = Object.assign(new Error('Bearer secret; resume text'), {
      status: 401,
      code: 'invalid_api_key',
      request: { content: 'private resume' },
    })
    const result = describeFailure(new Error('wrapper', { cause }))
    expect(result.hint).toContain('鉴权')
    expect(result.chain[1]).toEqual({ type: 'Error', status: 401, code: 'invalid_api_key' })
    expect(JSON.stringify(result)).not.toMatch(/secret|resume|Bearer/)
  })
  it('writes a correlated record to terminal and local file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rolelens-log-'))
    vi.stubEnv('ROLELENS_DATA_DIR', dir)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = reportFailure(new Error('private data'), 'import.generate_drafts')
      const file = readdirSync(join(dir, 'logs'))[0]!
      const record = JSON.parse(readFileSync(join(dir, 'logs', file), 'utf8'))
      expect(record.errorId).toBe(result.errorId)
      expect(record.stage).toBe('import.generate_drafts')
      expect(log).toHaveBeenCalledWith('[RoleLens]', expect.stringContaining(result.errorId))
      expect(JSON.stringify(record)).not.toContain('private data')
    } finally {
      log.mockRestore()
      vi.unstubAllEnvs()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
