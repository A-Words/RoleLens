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
