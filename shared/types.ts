import { z } from 'zod'

export const categories = ['personal', 'education', 'work', 'project', 'skill', 'achievement', 'contact', 'preference'] as const
export const categoryLabels: Record<typeof categories[number], string> = {
  personal: '个人背景', education: '教育', work: '工作', project: '项目', skill: '技能', achievement: '成果', contact: '联系方式', preference: '求职偏好',
}
export const factInput = z.object({
  category: z.enum(categories), title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(6000), enabled: z.boolean().default(true),
})
export type FactInput = z.infer<typeof factInput>
export type Fact = FactInput & { id: string; sourceId: string; version: number; updatedAt: string }
export type Draft = FactInput & { id: string; sourceId: string; targetId: string | null; expectedVersion: number | null; status: string }
export type Source = { id: string; name: string; text: string; createdAt: string }
export const jobInput = z.object({ company: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(120), jd: z.string().trim().min(10).max(30000) })
export type Job = z.infer<typeof jobInput> & { id: string; createdAt: string }
export const analysisSchema = z.object({
  requirements: z.array(z.object({ requirement: z.string(), factIds: z.array(z.string()), assessment: z.string() })).max(20),
  questions: z.array(z.string()).max(5),
})
export type Analysis = z.infer<typeof analysisSchema>
export const resumeSchema = z.object({
  headline: z.string().max(180),
  sections: z.array(z.object({ title: z.string().max(80), items: z.array(z.object({ text: z.string().min(1).max(1500), factIds: z.array(z.string()).min(1) })).min(1).max(12) })).min(1).max(10),
  greetings: z.array(z.object({ style: z.enum(['简洁直接', '项目匹配', '自然交流']), text: z.string().min(1).max(150), factIds: z.array(z.string()).min(1) })).length(3),
})
export type Resume = z.infer<typeof resumeSchema>
export type Generation = { id: string; jobId: string; sessionId: string; content: Resume; createdAt: string; edited: boolean; version: number }
export type Session = { id: string; jobId: string; status: string; revision: number; analysis: Analysis | null; question: string[]; error: string | null; createdAt: string }
export type Trace = { id: number; sessionId: string; event: string; detail: string; createdAt: string }
