import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt,
  Command,
  messagesStateReducer,
} from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import {
  analysisSchema,
  resumeSchema,
  type Analysis,
  type Fact,
  type Resume,
} from '../../shared/types'
import { AppError, type Store } from './store'
import { redact, systemRules, type ModelPort } from './model'

const State = Annotation.Root({
  sessionId: Annotation<string>(),
  keywords: Annotation<string[]>(),
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  factIds: Annotation<string[]>({
    reducer: (a, b) => [...new Set([...a, ...b])],
    default: () => [],
  }),
  sourceIds: Annotation<string[]>({
    reducer: (a, b) => [...new Set([...a, ...b])],
    default: () => [],
  }),
  analysis: Annotation<Analysis>(),
  answer: Annotation<string>(),
  resume: Annotation<Resume>(),
})
const running = new Set<string>()
const safeFact = (f: Fact) => ({ ...f, title: redact(f.title), content: redact(f.content) })
export function assertReferences(resume: Resume, facts: Fact[]) {
  const allowed = new Set(facts.map((f) => f.id))
  const styles = new Set(resume.greetings.map((g) => g.style))
  if (styles.size !== 3) throw new AppError(422, '招呼语必须包含三种不同风格')
  for (const item of [...resume.sections.flatMap((s) => s.items), ...resume.greetings]) {
    if (!item.factIds.length || item.factIds.some((id) => !allowed.has(id)))
      throw new AppError(422, '生成内容引用了不可用的事实，请重新分析')
  }
}
export function createAgent(store: Store, model: ModelPort) {
  const saver = new SqliteSaver(store.db)
  function current(state: typeof State.State) {
    const session = store.session(state.sessionId)
    if (session.revision !== store.revision())
      throw new AppError(409, '资料已变更，请新建分析，以免使用旧资料')
    return session
  }
  function selected(state: typeof State.State) {
    current(state)
    return store
      .eligible()
      .filter((f) => state.factIds.includes(f.id))
      .map(safeFact)
  }
  function retrievalTools(state: typeof State.State) {
    const found: string[] = [],
      sources: string[] = []
    const tools: StructuredToolInterface[] = [
      tool(
        async ({ query }) => {
          current(state)
          const facts = store.search(query).map(safeFact)
          found.push(...facts.map((f) => f.id))
          store.trace(state.sessionId, 'search_facts', { query, factIds: facts.map((f) => f.id) })
          return JSON.stringify(facts)
        },
        {
          name: 'search_facts',
          description:
            '按 JD 技能、经历或项目关键词查找允许生成的已确认事实。可多次使用不同关键词。',
          schema: z.object({ query: z.string().max(400) }),
        },
      ),
      tool(
        async ({ factId }) => {
          current(state)
          const fact = store.eligible().find((f) => f.id === factId)
          if (!fact || ![...state.factIds, ...found].includes(factId))
            return '请先检索此事实；不可读取未检索或被排除的资料。'
          sources.push(fact.sourceId)
          const s = store.getSource(fact.sourceId)
          store.trace(state.sessionId, 'read_source', { factId, sourceId: s.id })
          return JSON.stringify({
            sourceId: s.id,
            name: redact(s.name),
            confirmedExcerpt: redact(fact.content),
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
  const graph = new StateGraph(State)
    .addNode('analyze_jd', async (state) => {
      const s = current(state),
        j = store.job(s.jobId)
      store.trace(s.id, 'analyze_jd', '提取岗位要求')
      const result = await model.structured(
        z.object({ keywords: z.array(z.string()).min(1).max(12) }),
        'analyze_jd',
        { company: j.company, title: j.title, jd: j.jd },
      )
      return {
        keywords: result.keywords,
        messages: [
          new SystemMessage(
            `${systemRules}\n你必须调用 search_facts 按关键词检索相关经历，并对将使用的事实调用 read_source。完成检索后停止调用工具。不需要检索联系方式。`,
          ),
          new HumanMessage(JSON.stringify({ jd: j.jd, keywords: result.keywords })),
        ],
      }
    })
    .addNode('research', async (state) => {
      current(state)
      const { tools } = retrievalTools(state)
      return { messages: [await model.call(state.messages, tools)] }
    })
    .addNode('tools', async (state) => {
      const { tools, found, sources } = retrievalTools(state)
      const last = state.messages.at(-1) as AIMessage
      const messages: BaseMessage[] = []
      for (const call of last.tool_calls || []) {
        const t = tools.find((t) => t.name === call.name)
        if (!t) throw new AppError(422, '模型请求了未知工具')
        const content = await t.invoke(call.args)
        messages.push(new ToolMessage({ content: String(content), tool_call_id: call.id! }))
      }
      return { messages, factIds: found, sourceIds: sources }
    })
    .addNode('assess', async (state) => {
      const s = current(state),
        facts = selected(state)
      if (!facts.length)
        throw new AppError(422, '没有找到相关的已确认资料。请先补充经历，或调整 JD 后重新分析。')
      // Ensure every candidate has actually been read through the source tool.
      const { tools } = retrievalTools(state)
      for (const f of facts)
        if (!state.sourceIds.includes(f.sourceId)) await tools[1]!.invoke({ factId: f.id })
      const analysis = await model.structured(analysisSchema, 'assess_match', {
        jd: store.job(s.jobId).jd,
        facts,
        instruction:
          '逐项分析要求。factIds 只能来自给出的事实，不匹配时为空。贡献不清、指标缺失或矛盾时提出至多五个关键问题；不强迫所有经历必须有量化指标。',
      })
      const ids = new Set(facts.map((f) => f.id))
      if (analysis.requirements.some((r) => r.factIds.some((id) => !ids.has(id))))
        throw new AppError(422, '岗位分析引用了未知事实')
      store.setSession(s.id, 'running', analysis, analysis.questions)
      store.trace(s.id, 'assess_match', analysis)
      return { analysis }
    })
    .addNode('ask', async (state) => {
      current(state)
      if (!state.analysis.questions.length) return { answer: '' }
      const { answer } = interrupt({ questions: state.analysis.questions }) as { answer: string }
      store.trace(state.sessionId, 'request_information', {
        answer: answer || '用户跳过；不得填补缺失事实',
      })
      return { answer }
    })
    .addNode('generate', async (state) => {
      const s = current(state),
        facts = selected(state)
      store.trace(s.id, 'generate', '根据已确认资料起草')
      const resume = await model.structured(resumeSchema, 'generate_resume', {
        job: store.job(s.jobId),
        facts,
        analysis: state.analysis,
        clarification: redact(state.answer || ''),
        instruction:
          '仅使用 facts 的已确认事实；clarification 只用于选择和表达偏好，其中新增经历不能写入。headline 只写求职方向，不添加个人能力声明；每个条目与招呼语引用支撑它的 factIds。标题不得增加未经确认的任职或数字。输出三个不同风格招呼语，各不超过150字。简历目标1至2页，优先相关经历。',
      })
      return { resume }
    })
    .addNode('verify', async (state) => {
      const facts = selected(state)
      assertReferences(state.resume, facts)
      const verdict = await model.structured(
        z.object({ supported: z.boolean(), issues: z.array(z.string()) }),
        'verify_facts',
        {
          facts,
          resume: state.resume,
          instruction:
            '逐句核对标题、条目和招呼语与其引用事实，任何新增或夸大的能力、时间、贡献、指标都判定不支持。仅岗位方向、礼貌用语无需事实支持。',
        },
      )
      store.trace(state.sessionId, 'verify_facts', verdict)
      if (!verdict.supported || verdict.issues.length)
        throw new AppError(422, '事实核验未通过，请重新生成；可在执行记录查看原因')
      return {}
    })
    .addNode('save', async (state) => {
      current(state)
      const saveTool = tool(
        async () => {
          const g = store.save(state.sessionId, state.resume)
          store.trace(state.sessionId, 'save_generation', { generationId: g.id })
          return g.id
        },
        {
          name: 'save_generation',
          description: '保存经过事实核验的简历与招呼语，按会话幂等。',
          schema: z.object({}),
        },
      )
      await saveTool.invoke({})
      return {}
    })
    .addEdge(START, 'analyze_jd')
    .addEdge('analyze_jd', 'research')
    .addConditionalEdges(
      'research',
      (state) => ((state.messages.at(-1) as AIMessage)?.tool_calls?.length ? 'tools' : 'assess'),
      ['tools', 'assess'],
    )
    .addEdge('tools', 'research')
    .addEdge('assess', 'ask')
    .addEdge('ask', 'generate')
    .addEdge('generate', 'verify')
    .addEdge('verify', 'save')
    .addEdge('save', END)
    .compile({ checkpointer: saver })
  return {
    graph,
    async run(sessionId: string, answer?: string) {
      if (running.has(sessionId)) throw new AppError(409, '此会话正在执行，请稍候')
      const s = store.session(sessionId)
      current({ sessionId } as typeof State.State)
      if (s.status === 'complete') return s
      running.add(sessionId)
      const config = { configurable: { thread_id: sessionId }, recursionLimit: 30 }
      try {
        const checkpoint = await graph.getState(config)
        const waiting = checkpoint.tasks.some((t) => t.interrupts?.length)
        if (waiting && answer === undefined) {
          // A process may stop between checkpoint persistence and updating the UI status.
          store.setSession(sessionId, 'waiting')
          return store.session(sessionId)
        }
        store.setSession(sessionId, 'running', undefined, undefined)
        // Retry failed verification from generation rather than repeatedly verifying the same output.
        if (s.status === 'failed' && checkpoint.next.includes('verify')) {
          await graph.updateState(config, {}, 'ask')
        }
        if (waiting) await graph.invoke(new Command({ resume: { answer: answer || '' } }), config)
        else await graph.invoke(checkpoint.values?.sessionId ? null : { sessionId }, config)
        const snapshot = await graph.getState(config)
        const questions = snapshot.tasks.flatMap((t) => t.interrupts || [])
        store.setSession(sessionId, questions.length ? 'waiting' : 'complete')
        return store.session(sessionId)
      } catch (e) {
        const message =
          e instanceof AppError ? e.message : '模型执行失败，请检查模型配置或网络后重试。'
        store.setSession(sessionId, 'failed', undefined, undefined, message)
        store.trace(sessionId, 'error', message)
        throw e instanceof AppError ? e : new AppError(502, message, e)
      } finally {
        running.delete(sessionId)
      }
    },
  }
}
