import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Analysis, Draft, Fact, FactInput, Generation, Job, Resume, Session, Source, Trace } from '../../shared/types'

export class AppError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}
export const uid = () => randomUUID()
const now = () => new Date().toISOString()
export class Store {
  db: Database.Database
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new Database(resolve(directory, 'rolelens.sqlite'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('revision', 0);
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, name TEXT, text TEXT, createdAt TEXT);
      CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, category TEXT, title TEXT, content TEXT, enabled INTEGER, sourceId TEXT REFERENCES sources(id), version INTEGER, updatedAt TEXT);
      CREATE TABLE IF NOT EXISTS fact_versions (id TEXT, version INTEGER, snapshot TEXT, PRIMARY KEY(id, version));
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, category TEXT, title TEXT, content TEXT, enabled INTEGER, sourceId TEXT REFERENCES sources(id), targetId TEXT, expectedVersion INTEGER, status TEXT);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, company TEXT, title TEXT, jd TEXT, createdAt TEXT);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, jobId TEXT REFERENCES jobs(id), status TEXT, revision INTEGER, analysis TEXT, question TEXT, error TEXT, createdAt TEXT);
      CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT REFERENCES sessions(id), event TEXT, detail TEXT, createdAt TEXT);
      CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, jobId TEXT REFERENCES jobs(id), sessionId TEXT UNIQUE REFERENCES sessions(id), content TEXT, createdAt TEXT, edited INTEGER, version INTEGER);
    `)
  }
  revision() { return (this.db.prepare("SELECT value FROM meta WHERE key='revision'").get() as { value: number }).value }
  bump() { this.db.prepare("UPDATE meta SET value=value+1 WHERE key='revision'").run() }
  source(name: string, text: string): Source {
    const s = { id: uid(), name, text, createdAt: now() }
    this.db.prepare('INSERT INTO sources VALUES (@id,@name,@text,@createdAt)').run(s)
    return s
  }
  getSource(id: string) {
    const row = this.db.prepare('SELECT * FROM sources WHERE id=?').get(id) as Source | undefined
    if (!row) throw new AppError(404, '来源不存在')
    return row
  }
  facts(): Fact[] { return (this.db.prepare('SELECT * FROM facts ORDER BY updatedAt DESC').all() as Fact[]).map(f => ({ ...f, enabled: !!f.enabled })) }
  fact(id: string): Fact {
    const f = this.facts().find(f => f.id === id)
    if (!f) throw new AppError(404, '资料不存在或已删除')
    return f
  }
  eligible() { return this.facts().filter(f => f.enabled && f.category !== 'contact') }
  search(query: string): Fact[] {
    const terms = query.toLowerCase().match(/[a-z0-9+#.]+|[\u4e00-\u9fff]{2,}/g) || []
    const tokens = terms.flatMap(t => /[\u4e00-\u9fff]/.test(t) ? [t, ...Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2))] : [t])
    return this.eligible().map(f => ({ f, score: tokens.reduce((n, t) => n + (`${f.title} ${f.content}`.toLowerCase().includes(t) ? 1 : 0), 0) })).filter(x => x.score > 0 || !tokens.length).sort((a, b) => b.score - a.score).slice(0, 24).map(x => x.f)
  }
  draft(input: FactInput, sourceId: string, targetId: string | null = null): Draft {
    const expectedVersion = targetId ? this.fact(targetId).version : null
    const d = { ...input, id: uid(), sourceId, targetId, expectedVersion, status: 'pending' }
    this.db.prepare('INSERT INTO drafts VALUES (@id,@category,@title,@content,@enabled,@sourceId,@targetId,@expectedVersion,@status)').run({ ...d, enabled: +d.enabled })
    return d
  }
  drafts(): Draft[] { return (this.db.prepare("SELECT * FROM drafts WHERE status='pending'").all() as Draft[]).map(d => ({ ...d, enabled: !!d.enabled })) }
  confirm(id: string, input: FactInput) {
    return this.db.transaction(() => {
      const d = this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id) as Draft | undefined
      if (!d) throw new AppError(404, '草稿不存在')
      if (d.status !== 'pending') throw new AppError(409, '草稿已处理，请刷新列表')
      let f: Fact
      if (d.targetId) f = this.update(d.targetId, input, d.expectedVersion!, d.sourceId)
      else {
        f = { ...input, id: uid(), sourceId: d.sourceId, version: 1, updatedAt: now() }
        this.db.prepare('INSERT INTO facts VALUES (@id,@category,@title,@content,@enabled,@sourceId,@version,@updatedAt)').run({ ...f, enabled: +f.enabled })
        this.snapshot(f); this.bump()
      }
      this.db.prepare("UPDATE drafts SET status='confirmed' WHERE id=?").run(id)
      return f
    })()
  }
  discard(id: string) { this.db.prepare("UPDATE drafts SET status='discarded' WHERE id=? AND status='pending'").run(id) }
  snapshot(f: Fact) { this.db.prepare('INSERT INTO fact_versions VALUES (?,?,?)').run(f.id, f.version, JSON.stringify(f)) }
  versions(id: string) { return (this.db.prepare('SELECT snapshot FROM fact_versions WHERE id=? ORDER BY version DESC').all(id) as { snapshot: string }[]).map(r => JSON.parse(r.snapshot) as Fact) }
  update(id: string, input: FactInput, version: number, sourceId?: string): Fact {
    return this.db.transaction(() => {
      const old = this.fact(id)
      if (old.version !== version) throw new AppError(409, '资料已更新，请刷新后重试')
      // Direct edits are their own provenance; never attribute new text to an old upload.
      const source = sourceId || this.source('手动编辑', input.content).id
      const f = { ...old, ...input, sourceId: source, version: version + 1, updatedAt: now() }
      this.db.prepare('UPDATE facts SET category=@category,title=@title,content=@content,enabled=@enabled,sourceId=@sourceId,version=@version,updatedAt=@updatedAt WHERE id=@id').run({ ...f, enabled: +f.enabled })
      this.snapshot(f); this.bump(); return f
    })()
  }
  deleteFact(id: string, version: number) {
    this.db.transaction(() => {
      if (this.fact(id).version !== version) throw new AppError(409, '资料已更新，请刷新后重试')
      this.db.prepare('DELETE FROM facts WHERE id=?').run(id)
      this.db.prepare("UPDATE drafts SET status='discarded' WHERE targetId=?").run(id)
      this.bump()
    })()
  }
  jobs() { return this.db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC').all() as Job[] }
  job(id: string) { const j = this.jobs().find(j => j.id === id); if (!j) throw new AppError(404, '职位不存在'); return j }
  createJob(input: Omit<Job, 'id' | 'createdAt'>) { const j = { ...input, id: uid(), createdAt: now() }; this.db.prepare('INSERT INTO jobs VALUES (@id,@company,@title,@jd,@createdAt)').run(j); return j }
  createSession(jobId: string) {
    this.job(jobId)
    const s = { id: uid(), jobId, status: 'ready', revision: this.revision(), analysis: null, question: '[]', error: null, createdAt: now() }
    this.db.prepare('INSERT INTO sessions VALUES (@id,@jobId,@status,@revision,@analysis,@question,@error,@createdAt)').run(s)
    return this.session(s.id)
  }
  session(id: string): Session {
    const s = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as (Omit<Session, 'analysis' | 'question'> & { analysis: string | null; question: string }) | undefined
    if (!s) throw new AppError(404, '会话不存在')
    return { ...s, analysis: s.analysis ? JSON.parse(s.analysis) : null, question: JSON.parse(s.question) }
  }
  sessions(jobId: string) { return (this.db.prepare('SELECT id FROM sessions WHERE jobId=? ORDER BY createdAt DESC').all(jobId) as { id: string }[]).map(s => this.session(s.id)) }
  setSession(id: string, status: string, analysis?: Analysis, question?: string[], error: string | null = null) {
    const old = this.session(id)
    this.db.prepare('UPDATE sessions SET status=?,analysis=?,question=?,error=? WHERE id=?').run(status, JSON.stringify(analysis ?? old.analysis), JSON.stringify(question ?? old.question), error, id)
  }
  trace(sessionId: string, event: string, detail: unknown) { this.db.prepare('INSERT INTO traces (sessionId,event,detail,createdAt) VALUES (?,?,?,?)').run(sessionId, event, JSON.stringify(detail), now()) }
  traces(sessionId: string) { return this.db.prepare('SELECT * FROM traces WHERE sessionId=? ORDER BY id').all(sessionId) as Trace[] }
  save(sessionId: string, content: Resume): Generation {
    const s = this.session(sessionId)
    const g = { id: uid(), jobId: s.jobId, sessionId, content: JSON.stringify(content), createdAt: now(), edited: 0, version: 1 }
    this.db.prepare('INSERT OR IGNORE INTO generations VALUES (@id,@jobId,@sessionId,@content,@createdAt,@edited,@version)').run(g)
    return this.generations(s.jobId).find(g => g.sessionId === sessionId)!
  }
  generations(jobId: string): Generation[] { return (this.db.prepare('SELECT * FROM generations WHERE jobId=? ORDER BY createdAt DESC').all(jobId) as (Omit<Generation, 'content'> & { content: string })[]).map(g => ({ ...g, content: JSON.parse(g.content), edited: !!g.edited })) }
  generation(id: string): Generation {
    const g = this.db.prepare('SELECT * FROM generations WHERE id=?').get(id) as (Omit<Generation, 'content'> & { content: string }) | undefined
    if (!g) throw new AppError(404, '生成版本不存在')
    return { ...g, content: JSON.parse(g.content), edited: !!g.edited }
  }
  editGeneration(id: string, content: Resume, version: number) {
    const result = this.db.prepare('UPDATE generations SET content=?,edited=1,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(content), id, version)
    if (!result.changes) throw new AppError(409, '版本已更新或删除，请刷新')
    return this.generation(id)
  }
  deleteGeneration(id: string) { this.db.prepare('DELETE FROM generations WHERE id=?').run(id) }
  close() { this.db.close() }
}
let singleton: Store | undefined
export function getStore() { return singleton ??= new Store(resolve(process.env.ROLELENS_DATA_DIR || '.data')) }
