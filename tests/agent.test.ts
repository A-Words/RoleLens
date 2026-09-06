import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { Store } from '../server/core/store'
import { createAgent, assertReferences } from '../server/core/agent'
import { FakeModel } from './helpers/fake-model'
import { importDrafts } from '../server/core/import'
const dirs: string[] = [],
  stores: Store[] = []
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rolelens-agent-'))
  dirs.push(dir)
  const store = new Store(dir)
  stores.push(store)
  for (const [title, content] of [
    ['Vue 工作台', '使用 Vue 和 TypeScript 实现资料编辑。'],
    ['Python 分析', '使用 Python 完成数据清洗。'],
  ]) {
    const f = { category: 'project' as const, title: title!, content: content!, enabled: true }
    store.confirm(store.draft(f, store.source('测试文档', f.content).id).id, f)
  }
  const job = store.createJob({
    title: '前端开发',
    company: '测试公司',
    jd: '要求 Vue 和 TypeScript 开发经验',
  })
  return { store, job, model: new FakeModel() }
}
afterEach(() => {
  stores.forEach((s) => {
    if (s.db.open) s.close()
  })
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  stores.length = 0
  dirs.length = 0
})
test('real graph persists interruption, resumes after reopening DB and saves idempotently with evidence', async () => {
  const { store, job, model } = setup(),
    session = store.createSession(job.id)
  await createAgent(store, model).run(session.id)
  expect(store.session(session.id).status).toBe('waiting')
  expect(store.generations(job.id)).toHaveLength(0)
  const directory = store.directory
  store.close()
  const reopened = new Store(directory)
  stores.push(reopened)
  const agent = createAgent(reopened, model)
  await agent.run(session.id, '')
  expect(reopened.session(session.id).status).toBe('complete')
  const result = reopened.generations(job.id)[0]!
  expect(result.content.sections[0]!.items).toHaveLength(1)
  expect(result.content.sections[0]!.items[0]!.text).toContain('Vue')
  expect(result.evidence).toHaveLength(1)
  expect(reopened.traces(session.id).map((t) => t.event)).toEqual(
    expect.arrayContaining([
      'search_facts',
      'read_source',
      'request_information',
      'verify_facts',
      'save_generation',
    ]),
  )
  await agent.run(session.id)
  reopened.save(session.id, result.content)
  expect(reopened.generations(job.id)).toHaveLength(1)
  const f = reopened.fact(result.evidence[0]!.id)
  reopened.update(f.id, { ...f, content: '更新后的内容' }, f.version)
  expect(reopened.generations(job.id)[0]!.evidence[0]!.content).toContain('Vue')
})
test('different JD retrieves different facts and excludes contact information', async () => {
  const { store, model } = setup()
  const contact = {
    category: 'contact' as const,
    title: '联系方式',
    content: 'Python test@example.com',
    enabled: true,
  }
  store.confirm(store.draft(contact, store.source('联系', contact.content).id).id, contact)
  const job = store.createJob({
      title: '数据开发',
      company: '测试',
      jd: '需要 Python 数据清洗经验',
    }),
    s = store.createSession(job.id)
  const a = createAgent(store, model)
  await a.run(s.id)
  await a.run(s.id, '跳过')
  expect(store.generations(job.id)[0]!.content.sections[0]!.items[0]!.text).toContain('Python')
  expect(JSON.stringify(model.seen)).not.toContain('test@example.com')
})

test('invalid analysis references are repaired once using the allowed IDs', async () => {
  const { store, job, model } = setup()
  model.invalidAnalysisCount = 1
  const session = store.createSession(job.id)
  await createAgent(store, model).run(session.id)
  expect(store.session(session.id).status).toBe('waiting')
  expect(model.seen.filter((s) => s.stage === 'assess_match')).toHaveLength(2)
})

test('LangChain parser errors also trigger one correction', async () => {
  const { store, job, model } = setup()
  model.parserFailure = true
  const session = store.createSession(job.id)
  await createAgent(store, model).run(session.id)
  expect(store.session(session.id).status).toBe('waiting')
  expect(model.seen.filter((s) => s.stage === 'assess_match')).toHaveLength(2)
})

test('persistent invalid analysis references stop and can be retried from checkpoint', async () => {
  const { store, job, model } = setup()
  model.invalidAnalysisCount = 2
  const session = store.createSession(job.id)
  const agent = createAgent(store, model)
  await expect(agent.run(session.id)).rejects.toThrow('纠正后仍未通过')
  expect(store.session(session.id).status).toBe('failed')
  expect(store.generations(job.id)).toHaveLength(0)
  expect(model.seen.filter((s) => s.stage === 'assess_match')).toHaveLength(2)
  await agent.run(session.id)
  expect(store.session(session.id).status).toBe('waiting')
})
test('changed or deleted facts invalidate pending checkpoint', async () => {
  const { store, job, model } = setup(),
    s = store.createSession(job.id)
  const a = createAgent(store, model)
  await a.run(s.id)
  const f = store.facts()[0]!
  store.deleteFact(f.id, f.version)
  await expect(a.run(s.id, '')).rejects.toThrow('资料已变更')
  expect(store.generations(job.id)).toHaveLength(0)
})
test('failed generation resumes from checkpoint without duplicate results', async () => {
  const { store, job, model } = setup(),
    s = store.createSession(job.id),
    a = createAgent(store, model)
  await a.run(s.id)
  model.failOnce = true
  await expect(a.run(s.id, '')).rejects.toThrow('模型执行失败')
  expect(store.session(s.id).status).toBe('failed')
  await a.run(s.id)
  expect(store.generations(job.id)).toHaveLength(1)
})
test('unsupported output is not saved and retry regenerates', async () => {
  const { store, job, model } = setup(),
    s = store.createSession(job.id),
    a = createAgent(store, model)
  await a.run(s.id)
  model.unsupported = true
  await expect(a.run(s.id, '')).rejects.toThrow('事实核验未通过')
  expect(store.generations(job.id)).toHaveLength(0)
  model.unsupported = false
  await a.run(s.id)
  expect(model.seen.filter((x) => x.stage === 'generate_resume')).toHaveLength(2)
  const retryInput = model.seen.filter((x) => x.stage === 'generate_resume')[1]!.data as {
    correctionIssues: string[]
    previousDraft: unknown
  }
  expect(retryInput.correctionIssues).toEqual(['出现无依据指标'])
  expect(retryInput.previousDraft).toBeTruthy()
  expect(store.generations(job.id)).toHaveLength(1)
  const content = store.generations(job.id)[0]!.content
  content.sections[0]!.items[0]!.factIds = ['invented']
  expect(() => assertReferences(content, store.eligible())).toThrow('不可用')
})

test('basic profile is included even without matching JD keywords, respecting exclusions', async () => {
  const { store, job, model } = setup()
  for (const [category, content, enabled] of [
    ['education', '软件工程本科，2028年毕业', true],
    ['personal', '不应发送的个人信息', false],
    ['contact', 'private@example.com', true],
  ] as const) {
    const fact = { category, content, title: category, enabled }
    store.confirm(store.draft(fact, store.source('基础档案', content).id).id, fact)
  }
  const session = store.createSession(job.id)
  await createAgent(store, model).run(session.id)
  const input = JSON.stringify(model.seen.find((s) => s.stage === 'assess_match')!.data)
  expect(input).toContain('2028年毕业')
  expect(input).not.toContain('不应发送')
  expect(input).not.toContain('private@example.com')
})
test('conversation extraction and target edits only propose drafts', async () => {
  const { store, model } = setup(),
    target = store.facts()[0]!,
    before = store.facts().length
  await importDrafts(store, model, '补充已实现的导出能力', '对话', target.id)
  expect(store.facts()).toHaveLength(before)
  expect(store.fact(target.id).content).toBe(target.content)
  const draft = store.drafts()[0]!
  store.confirm(draft.id, draft)
  expect(store.fact(target.id).content).toBe('补充已实现的导出能力')
})

test('recovering an interrupted checkpoint repairs a stale running status', async () => {
  const { store, job, model } = setup()
  const session = store.createSession(job.id)
  const agent = createAgent(store, model)
  await agent.run(session.id)
  store.setSession(session.id, 'running')
  await agent.run(session.id)
  expect(store.session(session.id).status).toBe('waiting')
  expect(store.generations(job.id)).toHaveLength(0)
})

test('concurrent runs for the same session are rejected', async () => {
  const { store, job, model } = setup()
  const session = store.createSession(job.id)
  const agent = createAgent(store, model)
  const first = agent.run(session.id)
  await expect(agent.run(session.id)).rejects.toThrow('正在执行')
  await first
})
