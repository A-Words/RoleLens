import type Database from 'better-sqlite3'
import { getStore, AppError } from './store'
import {
  settingsSchema,
  settingsWriteSchema,
  secretNames,
  type Settings,
  type SecretName,
  type SettingsView,
} from '../../shared/settings'

type Environment = Readonly<Record<string, string | undefined>>
type Resolved = Settings & Record<SecretName, string> & { langfuseAvailable: boolean }
export interface SecretStore {
  get(reference: string): string | undefined
  set(reference: string, value: string | null): void
}
export interface RuntimeConfigProvider {
  resolve(): Resolved
  view(): SettingsView
  save(input: unknown): SettingsView
}
export function deploymentMode(env: Environment = process.env): 'local' {
  if (env.ROLELENS_MODE && env.ROLELENS_MODE !== 'local')
    throw new AppError(503, '目前仅实现 Local Mode，Hosted Mode 尚不可用。')
  return 'local'
}
class SQLiteSecretStore implements SecretStore {
  constructor(private db: Database.Database) {
    db.exec(
      'CREATE TABLE IF NOT EXISTS local_secrets (reference TEXT PRIMARY KEY, value TEXT NOT NULL)',
    )
  }
  get(reference: string) {
    return (
      this.db.prepare('SELECT value FROM local_secrets WHERE reference = ?').get(reference) as
        { value: string } | undefined
    )?.value
  }
  set(reference: string, value: string | null) {
    if (value === null)
      this.db.prepare('DELETE FROM local_secrets WHERE reference = ?').run(reference)
    else this.db.prepare('INSERT OR REPLACE INTO local_secrets VALUES (?, ?)').run(reference, value)
  }
}
const envKeys = {
  provider: 'ROLELENS_PROVIDER',
  baseUrl: 'ROLELENS_BASE_URL',
  model: 'ROLELENS_MODEL',
  protocol: 'ROLELENS_API_PROTOCOL',
  apiKey: 'ROLELENS_API_KEY',
  langfuseEnabled: 'ROLELENS_LANGFUSE_ENABLED',
  langfuseBaseUrl: 'LANGFUSE_BASE_URL',
  langfusePublicKey: 'LANGFUSE_PUBLIC_KEY',
  langfuseSecretKey: 'LANGFUSE_SECRET_KEY',
} as const
const tracingSchema = settingsSchema.pick({ langfuseEnabled: true, langfuseBaseUrl: true })
const modelSchema = settingsSchema.omit({ langfuseEnabled: true, langfuseBaseUrl: true })
export class LocalConfigProvider implements RuntimeConfigProvider {
  private secrets: SecretStore
  constructor(
    private db: Database.Database,
    private env: Environment = process.env,
    secrets?: SecretStore,
  ) {
    deploymentMode(env)
    db.exec(
      'CREATE TABLE IF NOT EXISTS local_settings (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL)',
    )
    this.secrets = secrets ?? new SQLiteSecretStore(db)
  }
  private stored() {
    const row = this.db.prepare('SELECT value FROM local_settings WHERE id = 1').get() as
      { value: string } | undefined
    return row
      ? (JSON.parse(row.value) as { settings: Settings; refs: Partial<Record<SecretName, string>> })
      : { settings: settingsSchema.parse({}), refs: {} }
  }
  private overrides() {
    return Object.entries(envKeys)
      .filter(([, key]) => !!this.env[key])
      .map(([key]) => key)
  }
  resolve(): Resolved {
    const stored = this.stored()
    const values: Record<string, unknown> = { ...stored.settings }
    for (const name of secretNames)
      values[name] = stored.refs[name] ? this.secrets.get(stored.refs[name]!) || '' : ''
    for (const [name, key] of Object.entries(envKeys))
      if (this.env[key]) values[name] = this.env[key]
    if (values.langfuseEnabled === 'true' || values.langfuseEnabled === 'false') {
      values.langfuseEnabled = values.langfuseEnabled === 'true'
    }
    const tracing = tracingSchema.safeParse({
      langfuseEnabled: values.langfuseEnabled,
      langfuseBaseUrl: values.langfuseBaseUrl,
    })
    const parsed = modelSchema.safeParse(
      Object.fromEntries(Object.keys(modelSchema.shape).map((key) => [key, values[key]])),
    )
    if (!parsed.success)
      throw new AppError(
        503,
        '运行时配置无效，请检查设置或 ROLELENS_API_PROTOCOL 等环境 override。',
      )
    return {
      ...parsed.data,
      // Invalid optional tracing must never block model tasks or settings recovery.
      ...(tracing.success ? tracing.data : tracingSchema.parse({})),
      ...(Object.fromEntries(secretNames.map((name) => [name, values[name]])) as Record<
        SecretName,
        string
      >),
      langfuseAvailable:
        tracing.success &&
        this.env.NODE_ENV === 'development' &&
        (!this.env.LANGFUSE_TRACING_ENVIRONMENT ||
          this.env.LANGFUSE_TRACING_ENVIRONMENT === 'development'),
    }
  }
  view(): SettingsView {
    const resolved = this.resolve()
    return {
      mode: 'local',
      settings: this.stored().settings,
      effectiveSettings: settingsSchema.parse(
        Object.fromEntries(
          Object.keys(settingsSchema.shape).map((key) => [key, resolved[key as keyof Settings]]),
        ),
      ),
      configured: !!(resolved.apiKey && resolved.model),
      secrets: Object.fromEntries(secretNames.map((name) => [name, !!resolved[name]])) as Record<
        SecretName,
        boolean
      >,
      overrides: this.overrides(),
      langfuseAvailable: resolved.langfuseAvailable,
      langfuseRestartRequired: true,
    }
  }
  save(input: unknown) {
    const value = settingsWriteSchema.parse(input)
    return this.db.transaction(() => {
      const { refs } = this.stored()
      for (const name of secretNames)
        if (value[name] !== undefined) {
          const reference = refs[name] || `local/${name}`
          this.secrets.set(reference, value[name]!)
          if (value[name] === null) delete refs[name]
          else refs[name] = reference
        }
      const settings = settingsSchema.parse(
        Object.fromEntries(
          Object.keys(settingsSchema.shape).map((key) => [key, value[key as keyof Settings]]),
        ),
      )
      this.db
        .prepare('INSERT OR REPLACE INTO local_settings VALUES (1, ?)')
        .run(JSON.stringify({ settings, refs }))
      return this.view()
    })()
  }
}
export function runtimeConfig(): RuntimeConfigProvider {
  deploymentMode()
  return new LocalConfigProvider(getStore().db)
}
