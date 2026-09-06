import type { Trace } from './types'

export function verificationIssues(traces: Trace[]): string[] {
  const latest = [...traces].reverse().find((t) => t.event === 'verify_facts')
  if (!latest) return []
  try {
    const value = JSON.parse(latest.detail)
    // Existing checkpoints used `issues`; keep retries of those sessions useful.
    const issues = value.blockingIssues ?? value.issues
    return Array.isArray(issues) ? issues.filter((i): i is string => typeof i === 'string') : []
  } catch {
    return []
  }
}
