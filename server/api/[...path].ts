import { runtimeConfig } from '../core/runtime-config'
import { testConnection } from '../core/connection-test'
import { z, ZodError } from 'zod'
import { factInput, jobInput, resumeSchema } from '../../shared/types'
import { AppError, getStore } from '../core/store'
import { configured, createModel } from '../core/model'
import { extractText, importDrafts } from '../core/import'
import { createAgent } from '../core/agent'
import { exportPdf } from '../core/pdf'
import { reportFailure } from '../core/diagnostics'

export default defineEventHandler(async (event) => {
  let stage = 'api'
  try {
    const store = getStore(),
      path = getRouterParam(event, 'path') || '',
      method = event.method
    const parts = path.split('/'),
      id = parts[1] || '',
      action = parts[2]
    const body = async () => await readBody(event)
    if (path === 'settings/test-connection' && method === 'POST') return await testConnection()
    if (path === 'settings') {
      if (method === 'GET') return runtimeConfig().view()
      if (method === 'PUT') return runtimeConfig().save(await body())
    }
    if (method === 'GET' && path === 'status')
      return { configured: configured(), revision: store.revision() }
    if (parts[0] === 'facts') {
      if (method === 'GET' && !id) return store.facts()
      if (method === 'GET' && action === 'versions') return store.versions(id)
      if (method === 'PATCH' && id) {
        const b = factInput.extend({ version: z.number().int().positive() }).parse(await body())
        return store.update(id, b, b.version)
      }
      if (method === 'DELETE' && id) {
        const b = z.object({ version: z.number().int().positive() }).parse(await body())
        store.deleteFact(id, b.version)
        return { ok: true }
      }
    }
    if (parts[0] === 'sources' && method === 'GET') {
      if (id) return store.getSource(id)
      return store.db.prepare('SELECT id, name FROM sources ORDER BY createdAt DESC').all()
    }
    if (parts[0] === 'drafts') {
      if (method === 'GET' && !id) return store.drafts()
      if (method === 'POST' && action === 'confirm')
        return store.confirm(id, factInput.parse(await body()))
      if (method === 'DELETE' && id) {
        store.discard(id)
        return { ok: true }
      }
      if (method === 'POST' && !id) {
        const b = factInput.extend({ targetId: z.string().optional() }).parse(await body())
        const source = store.source('手动录入', b.content)
        return store.draft(b, source.id, b.targetId)
      }
    }
    if (method === 'POST' && path === 'import') {
      stage = 'import.model_config'
      const model = createModel()
      if (getHeader(event, 'content-type')?.includes('multipart/form-data')) {
        const fields = await readMultipartFormData(event)
        const file = fields?.find((f) => f.name === 'file')
        if (!file?.filename) throw new AppError(400, '请选择文件')
        stage = 'import.extract_text'
        const text = await extractText(file.filename, file.data)
        stage = 'import.generate_drafts'
        return await importDrafts(store, model, text, file.filename, undefined, file.data)
      }
      const b = z
        .object({
          text: z.string().trim().min(1).max(60000),
          name: z.string().max(120).default('对话补充'),
          targetId: z.string().optional(),
        })
        .parse(await body())
      stage = 'import.generate_drafts'
      return await importDrafts(store, model, b.text, b.name, b.targetId)
    }
    if (parts[0] === 'jobs') {
      if (method === 'GET' && !id) return store.jobs()
      if (method === 'POST' && !id) return store.createJob(jobInput.parse(await body()))
      if (method === 'GET' && id)
        return {
          job: store.job(id),
          sessions: store.sessions(id),
          generations: store.generations(id),
        }
      if (method === 'POST' && action === 'sessions') {
        createModel()
        return store.createSession(id)
      }
    }
    if (parts[0] === 'sessions' && id) {
      if (method === 'GET') return { session: store.session(id), traces: store.traces(id) }
      if (method === 'POST' && action === 'run') {
        stage = 'agent.run'
        const b = z.object({ answer: z.string().max(6000).optional() }).parse((await body()) || {})
        return await createAgent(store, createModel()).run(id, b.answer)
      }
    }
    if (parts[0] === 'generations' && id) {
      if (method === 'PATCH') {
        const b = z
          .object({ content: resumeSchema, version: z.number().int().positive() })
          .parse(await body())
        return store.editGeneration(id, b.content, b.version)
      }
      if (method === 'DELETE') {
        store.deleteGeneration(id)
        return { ok: true }
      }
      if (method === 'GET' && action === 'pdf') {
        stage = 'resume.export_pdf'
        const g = store.generation(id)
        const pdf = await exportPdf(
          g.content,
          store
            .facts()
            .filter((f) => f.enabled && f.category === 'contact')
            .map((f) => f.content),
        )
        setHeader(event, 'Content-Type', 'application/pdf')
        setHeader(
          event,
          'Content-Disposition',
          `attachment; filename="RoleLens-${g.id.slice(0, 8)}.pdf"`,
        )
        return pdf
      }
    }
    throw new AppError(404, '接口不存在')
  } catch (e) {
    if (e instanceof ZodError && stage !== 'import.generate_drafts')
      throw createError({
        statusCode: 400,
        message:
          '输入格式不正确：' + e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；'),
      })
    if (e instanceof AppError && e.statusCode < 500)
      throw createError({ statusCode: e.statusCode, message: e.message })
    // Provider errors can contain request details. Never echo them into the browser.
    const { errorId, hint } = reportFailure(e, stage)
    throw createError({
      statusCode: e instanceof AppError ? e.statusCode : 500,
      message: `${e instanceof AppError ? e.message : stage === 'import.extract_text' ? '文件文字提取失败，请检查文件是否损坏、加密或与扩展名一致。' : hint}（错误编号：${errorId}）`,
      data: { errorId, stage },
    })
  }
})
