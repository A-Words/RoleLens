import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { Store } from '../server/core/store'
const dirs: string[] = [],
  stores: Store[] = []
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rolelens-'))
  dirs.push(dir)
  const s = new Store(dir)
  stores.push(s)
  return s
}
const input = {
  category: 'project' as const,
  title: '前端项目',
  content: '使用 Vue 和 TypeScript 实现网页',
  enabled: true,
}
function fact(s: Store) {
  return s.confirm(s.draft(input, s.source('测试', input.content).id).id, input)
}
afterEach(() => {
  stores.forEach((s) => {
    if (s.db.open) s.close()
  })
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  stores.length = 0
  dirs.length = 0
})
test('drafts require confirmation; confirmation is atomic and rejects duplicate', () => {
  const s = setup(),
    d = s.draft(input, s.source('资料', input.content).id)
  expect(s.eligible()).toHaveLength(0)
  s.confirm(d.id, input)
  expect(() => s.confirm(d.id, input)).toThrow('草稿已处理')
  expect(s.eligible()).toHaveLength(1)
})

test('job summaries follow persisted workflow and count unique analysis references', () => {
  const s = setup(),
    f = fact(s)
  const job = s.createJob({ title: '前端', company: '测试', jd: 'Vue' })
  const summary = () => s.jobList().find((j) => j.id === job.id)!.summary
  expect(summary()).toMatchObject({ state: 'unanalyzed', analysis: null, generationCount: 0 })
  const session = s.createSession(job.id)
  expect(summary().state).toBe('unanalyzed')
  const analysis = {
    requirements: [
      { requirement: 'Vue', factIds: [f.id], assessment: '关联经历' },
      { requirement: 'TypeScript', factIds: [f.id], assessment: '关联同一经历' },
      { requirement: '部署经验', factIds: [], assessment: '暂无依据' },
    ],
    questions: ['补充部署经验？'],
  }
  s.setSession(session.id, 'running', analysis)
  expect(summary()).toMatchObject({
    state: 'running',
    analysis: { requirementCount: 3, evidenceCount: 1, unlinkedCount: 1 },
  })
  expect(summary().analysis?.preview).toHaveLength(2)
  s.setSession(session.id, 'waiting')
  expect(summary().state).toBe('waiting')
  s.setSession(session.id, 'failed')
  expect(summary().state).toBe('failed')
  const generation = s.save(session.id, {
    headline: '前端',
    sections: [{ title: '经历', items: [{ text: f.content, factIds: [f.id] }] }],
    greetings: (['简洁直接', '项目匹配', '自然交流'] as const).map((style) => ({
      style,
      text: '你好',
      factIds: [f.id],
    })),
  })
  s.setSession(session.id, 'complete')
  expect(summary()).toMatchObject({ state: 'generated', generationCount: 1, stale: false })
  s.update(f.id, { ...input, content: '资料发生更新' }, f.version)
  expect(summary()).toMatchObject({ state: 'generated', stale: true })
  s.deleteGeneration(generation.id)
  expect(summary()).toMatchObject({ state: 'restart', generationCount: 0 })
})

test('a newer failed session is not masked by historical generations, including timestamp ties', () => {
  const s = setup()
  const job = s.createJob({ title: '前端', company: '测试', jd: 'Vue' })
  const first = s.createSession(job.id)
  s.save(first.id, { headline: '历史版本', sections: [], greetings: [] })
  s.setSession(first.id, 'complete')
  const latest = s.createSession(job.id)
  s.db.prepare('UPDATE sessions SET createdAt=? WHERE jobId=?').run(first.createdAt, job.id)
  s.setSession(latest.id, 'failed')
  expect(s.sessions(job.id)[0]?.id).toBe(latest.id)
  expect(s.jobList()[0]?.summary).toMatchObject({
    state: 'failed',
    generationCount: 1,
    analysis: null,
  })
})
test('stale edits and stale draft confirmation cannot overwrite newer facts', () => {
  const s = setup(),
    f = fact(s),
    d = s.draft(input, f.sourceId, f.id)
  s.update(f.id, { ...input, content: '新的确认内容' }, f.version)
  expect(() => s.update(f.id, input, f.version)).toThrow('已更新')
  expect(() => s.confirm(d.id, input)).toThrow('已更新')
  expect(s.versions(f.id)).toHaveLength(2)
  expect(s.getSource(s.fact(f.id).sourceId).text).toBe('新的确认内容')
})
test('excluded, contact and deleted facts never enter retrieval; changes persist', () => {
  const s = setup(),
    f = fact(s)
  expect(s.search('Vue')).toHaveLength(1)
  s.update(f.id, { ...input, enabled: false }, f.version)
  expect(s.search('Vue')).toHaveLength(0)
  const contact = { ...input, category: 'contact' as const }
  s.confirm(s.draft(contact, f.sourceId).id, contact)
  expect(s.eligible()).toHaveLength(0)
  s.deleteFact(f.id, 2)
  const directory = s.directory
  s.close()
  const reopened = new Store(directory)
  stores.push(reopened)
  expect(() => reopened.fact(f.id)).toThrow('不存在')
  expect(reopened.revision()).toBe(4)
})
