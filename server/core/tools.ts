import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import type { Fact, FactInput, Resume } from '../../shared/types'
import { redact } from './model'
import type { Store } from './store'

export const safeFact = (fact: Fact) => ({
  ...fact,
  title: redact(fact.title),
  // Source-local labels are not globally unique citation identifiers.
  content: redact(fact.content).replace(
    /事实\s*ID\s*[:：]\s*[A-Za-z][A-Za-z0-9-]*[。.;；]?\s*/gi,
    '',
  ),
})

type RetrievalToolOptions = {
  store: Store
  sessionId: string
  factIds: string[]
  ensureCurrent: () => unknown
}

export function createRetrievalTools({
  store,
  sessionId,
  factIds,
  ensureCurrent,
}: RetrievalToolOptions) {
  const found: string[] = [],
    sources: string[] = []
  const tools: StructuredToolInterface[] = [
    tool(
      async ({ query }) => {
        ensureCurrent()
        const facts = store.search(query).map(safeFact)
        found.push(...facts.map((fact) => fact.id))
        store.trace(sessionId, 'search_facts', { query, factIds: facts.map((fact) => fact.id) })
        return JSON.stringify(facts)
      },
      {
        name: 'search_facts',
        description: '按 JD 技能、经历或项目关键词查找允许生成的已确认事实。可多次使用不同关键词。',
        schema: z.object({ query: z.string().max(400) }),
      },
    ),
    tool(
      async ({ factId }) => {
        ensureCurrent()
        const fact = store.eligible().find((candidate) => candidate.id === factId)
        if (
          !fact ||
          (!['personal', 'education', 'preference'].includes(fact.category) &&
            ![...factIds, ...found].includes(factId))
        )
          return '请先检索此事实；不可读取未检索或被排除的资料。'
        sources.push(fact.sourceId)
        const source = store.getSource(fact.sourceId)
        store.trace(sessionId, 'read_source', { factId, sourceId: source.id })
        return JSON.stringify({
          sourceId: source.id,
          name: redact(source.name),
          confirmedExcerpt: safeFact(fact).content,
          factId,
        })
      },
      {
        name: 'read_source',
        description: '读取已检索事实的来源名称与已确认摘录。生成前应检查所用事实来源。',
        schema: z.object({ factId: z.string() }),
      },
    ),
  ]
  return { tools, found, sources }
}

export function createSaveGenerationTool(
  store: Store,
  sessionId: string,
  resume: Resume,
  ensureCurrent: () => unknown,
) {
  return tool(
    async () => {
      ensureCurrent()
      const generation = store.save(sessionId, resume)
      store.trace(sessionId, 'save_generation', { generationId: generation.id })
      return generation.id
    },
    {
      name: 'save_generation',
      description: '保存经过事实核验的简历与招呼语，按会话幂等。',
      schema: z.object({}),
    },
  )
}

type FactDraft = Omit<FactInput, 'enabled'>

export function createProfileDraftTool(
  store: Store,
  {
    name,
    text,
    targetId,
    drafts,
    file,
  }: { name: string; text: string; targetId?: string; drafts: FactDraft[]; file?: Buffer },
) {
  return tool(
    async () =>
      store.db.transaction(() => {
        const source = store.source(name, text)
        const proposed = drafts.map((draft) =>
          store.draft({ ...draft, enabled: true }, source.id, targetId || null),
        )
        if (file) {
          const directory = resolve(store.directory, 'uploads')
          mkdirSync(directory, { recursive: true })
          writeFileSync(resolve(directory, `${source.id}${extname(name).toLowerCase()}`), file)
        }
        return { source, drafts: proposed }
      })(),
    {
      name: 'propose_profile_drafts',
      description: '保存资料修改草稿，等待用户确认，不写入事实库。',
      schema: z.object({}),
    },
  )
}
