import { test, expect } from 'vitest'
import { requirementState } from '../shared/matching'
import { analysisSchema } from '../shared/types'
import { resumeText } from '../shared/resume-text'

test('legacy evidence is not treated as a support judgment', () => {
  const r = { requirement: 'Vue', factIds: ['f'], assessment: '完全匹配' }
  expect(analysisSchema.parse({ requirements: [r], questions: [] }).requirements).toHaveLength(1)
  expect(requirementState(r).label).toBe('已关联依据 · 待评估')
  expect(requirementState({ ...r, support: 'supported' }).label).toBe('已支持')
  expect(requirementState({ ...r, support: 'partial' }).label).toBe('部分支持')
  expect(requirementState({ ...r, support: 'supported', factIds: [] }).label).toBe('无依据')
  expect(requirementState({ ...r, support: 'clarification', factIds: [] }).label).toBe('待澄清')
})
test('resume presentation strips only explicit leading provenance labels', () => {
  expect(resumeText('事实：邮箱 a@example.com\n事实: 电话 123')).toBe(
    '邮箱 a@example.com\n电话 123',
  )
  expect(resumeText('核对事实：保留具体内容')).toBe('核对事实：保留具体内容')
})
