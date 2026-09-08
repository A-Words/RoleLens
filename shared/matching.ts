import type { Analysis } from './types'

// Legacy analyses do not carry a support judgment: references alone cannot prove full support.
export function requirementState(r: Analysis['requirements'][number]) {
  if (r.support === 'clarification') return { label: '待澄清', color: 'info' as const }
  if (!r.factIds.length) return { label: '无依据', color: 'neutral' as const }
  if (r.support === 'supported') return { label: '已支持', color: 'success' as const }
  if (r.support === 'partial') return { label: '部分支持', color: 'warning' as const }
  return { label: '已关联依据 · 待评估', color: 'neutral' as const }
}
