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
import { z } from 'zod'
import { OutputParserException } from '@langchain/core/output_parsers'
import {
  analysisSchema,
  resumeSchema,
  type Analysis,
  type Fact,
  type Resume,
} from '../../shared/types'
import { AppError, type Store } from './store'
import { redact, type ModelPort } from './model'
import { langfuseAgentTracer, type AgentTracer } from './langfuse'
import type { RunnableConfig } from '@langchain/core/runnables'
import { verificationIssues } from '../../shared/verification'
import { prompts } from './prompts'
import { createRetrievalTools, createSaveGenerationTool, safeFact } from './tools'

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
export function assertReferences(resume: Resume, facts: Fact[]) {
  const allowed = new Set(facts.map((f) => f.id))
  const styles = new Set(resume.greetings.map((g) => g.style))
  if (styles.size !== 3) throw new AppError(422, '招呼语必须包含三种不同风格')
  for (const item of [...resume.sections.flatMap((s) => s.items), ...resume.greetings]) {
    if (!item.factIds.length || item.factIds.some((id) => !allowed.has(id)))
      throw new AppError(422, '生成内容引用了不可用的事实，请重新分析')
  }
}
export function createAgent(
  store: Store,
  model: ModelPort,
  tracer: AgentTracer = langfuseAgentTracer,
) {
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
      .filter(
        (f) =>
          state.factIds.includes(f.id) ||
          ['personal', 'education', 'preference'].includes(f.category),
      )
      .map(safeFact)
  }
  function retrievalTools(state: typeof State.State) {
    return createRetrievalTools({
      store,
      sessionId: state.sessionId,
      factIds: state.factIds,
      ensureCurrent: () => current(state),
    })
  }
  const graph = new StateGraph(State)
    .addNode('analyze_jd', async (state, config: RunnableConfig) => {
      const s = current(state),
        j = store.job(s.jobId)
      store.trace(s.id, 'analyze_jd', '提取岗位要求')
      const result = await model.structured(
        z.object({ keywords: z.array(z.string()).min(1).max(12) }),
        'analyze_jd',
        { company: j.company, title: j.title, jd: j.jd },
        config,
      )
      return {
        keywords: result.keywords,
        messages: [
          new SystemMessage(prompts.researchSystem()),
          new HumanMessage(JSON.stringify({ jd: j.jd, keywords: result.keywords })),
        ],
      }
    })
    .addNode('research', async (state, config: RunnableConfig) => {
      current(state)
      const { tools } = retrievalTools(state)
      return { messages: [await model.call(state.messages, tools, config)] }
    })
    .addNode('tools', async (state, config: RunnableConfig) => {
      const { tools, found, sources } = retrievalTools(state)
      const last = state.messages.at(-1) as AIMessage
      const messages: BaseMessage[] = []
      for (const call of last.tool_calls || []) {
        const t = tools.find((t) => t.name === call.name)
        if (!t) throw new AppError(422, '模型请求了未知工具')
        const content = await t.invoke(call.args, config)
        messages.push(new ToolMessage({ content: String(content), tool_call_id: call.id! }))
      }
      return { messages, factIds: found, sourceIds: sources }
    })
    .addNode('assess', async (state, config: RunnableConfig) => {
      const s = current(state),
        facts = selected(state)
      if (!facts.length)
        throw new AppError(422, '没有找到相关的已确认资料。请先补充经历，或调整 JD 后重新分析。')
      // Ensure every candidate has actually been read through the source tool.
      const { tools } = retrievalTools(state)
      for (const f of facts)
        if (!state.sourceIds.includes(f.sourceId)) await tools[1]!.invoke({ factId: f.id }, config)
      const ids = new Set(facts.map((f) => f.id))
      const referenceSchema = analysisSchema.extend({
        requirements: z
          .array(
            analysisSchema.shape.requirements.element.extend({
              factIds: z.array(z.enum(facts.map((f) => f.id) as [string, ...string[]])),
            }),
          )
          .max(20),
      })
      const input = {
        jd: store.job(s.jobId).jd,
        facts,
        instruction: prompts.assessMatch,
      }
      let analysis: Analysis | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          analysis = await model.structured(referenceSchema, 'assess_match', input, config)
          if (analysis.requirements.some((r) => r.factIds.some((id) => !ids.has(id))))
            throw new AppError(422, '岗位分析引用了未知事实')
          break
        } catch (e) {
          // Only repair invalid structured output; transport/authentication errors must propagate.
          if (
            !(e instanceof z.ZodError) &&
            !(e instanceof AppError && e.statusCode === 422) &&
            !(e instanceof OutputParserException)
          )
            throw e
          if (attempt === 1)
            throw new AppError(
              422,
              '岗位分析返回的格式或事实引用无效，纠正后仍未通过。请从检查点重试。',
            )
          store.trace(s.id, 'assess_match', '分析格式或事实引用校验失败，正在纠正一次。')
          input.instruction += ` ${prompts.repairAssessment}`
        }
      }
      if (!analysis) throw new AppError(422, '岗位分析未返回结果')
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
    .addNode('generate', async (state, config: RunnableConfig) => {
      const s = current(state),
        facts = selected(state)
      store.trace(s.id, 'generate', '根据已确认资料起草')
      const references = z.array(z.enum(facts.map((f) => f.id) as [string, ...string[]])).min(1)
      const generationSchema = resumeSchema.extend({
        sections: z
          .array(
            resumeSchema.shape.sections.element.extend({
              items: z
                .array(
                  resumeSchema.shape.sections.element.shape.items.element.extend({
                    factIds: references,
                  }),
                )
                .min(1)
                .max(12),
            }),
          )
          .min(1)
          .max(10),
        greetings: z
          .array(resumeSchema.shape.greetings.element.extend({ factIds: references }))
          .length(3),
      })
      const input = {
        job: store.job(s.jobId),
        facts,
        analysis: state.analysis,
        clarification: redact(state.answer || ''),
        correctionIssues: verificationIssues(store.traces(s.id)),
        previousDraft: state.resume || null,
        instruction: prompts.generateResume,
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resume = await model.structured(generationSchema, 'generate_resume', input, config)
          assertReferences(resume, facts)
          return { resume }
        } catch (e) {
          if (
            !(e instanceof z.ZodError) &&
            !(e instanceof OutputParserException) &&
            !(e instanceof AppError && e.statusCode === 422)
          )
            throw e
          store.trace(s.id, 'generation_validation', {
            attempt: attempt + 1,
            message: '生成结果的格式或资料关联不正确。',
          })
          if (attempt === 1)
            throw new AppError(
              422,
              '生成结果的格式或资料关联未通过检查，自动修正未成功。请点击重试；无需修改已确认资料。',
            )
          input.instruction += ` ${prompts.repairGeneration}`
        }
      }
      throw new AppError(422, '生成结果为空，请重试。')
    })
    .addNode('verify', async (state, config: RunnableConfig) => {
      const facts = selected(state)
      try {
        assertReferences(state.resume, facts)
      } catch (e) {
        store.trace(state.sessionId, 'generation_validation', {
          message: '生成结果的资料关联不正确。',
        })
        throw new AppError(
          422,
          '生成结果的资料关联未通过检查，请点击重试自动修正；无需修改已确认资料。',
          e,
        )
      }
      const verdict = await model.structured(
        z.object({ blockingIssues: z.array(z.string()), notes: z.array(z.string()) }),
        'verify_facts',
        {
          facts,
          resume: state.resume,
          instruction: prompts.verifyFacts,
        },
        config,
      )
      store.trace(state.sessionId, 'verify_facts', verdict)
      if (verdict.blockingIssues.length)
        throw new AppError(422, '事实核验未通过，请重新生成；可在执行记录查看原因')
      return {}
    })
    .addNode('save', async (state, config: RunnableConfig) => {
      current(state)
      const saveTool = createSaveGenerationTool(store, state.sessionId, state.resume, () =>
        current(state),
      )
      await saveTool.invoke({}, config)
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
      let trace
      try {
        trace = tracer({ sessionId, jobId: s.jobId })
      } catch {
        trace = undefined
      }
      const config: RunnableConfig = {
        configurable: { thread_id: sessionId },
        recursionLimit: 30,
        ...trace?.config,
      }
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
        try {
          await trace?.finish()
        } catch {
          // Observability must not change the Agent result.
        }
        running.delete(sessionId)
      }
    },
  }
}
