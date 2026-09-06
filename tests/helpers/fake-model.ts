import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { z } from 'zod'
import type { ModelPort } from '../../server/core/model'
import type { Fact } from '../../shared/types'
import { OutputParserException } from '@langchain/core/output_parsers'

// Deterministic fixture, injected by tests only. Production never selects this model.
export class FakeModel implements ModelPort {
  failOnce = false
  unsupported = false
  invalidAnalysisCount = 0
  parserFailure = false
  seen: { stage: string; data: unknown }[] = []
  async structured<T>(schema: z.ZodType<T>, stage: string, data: unknown): Promise<T> {
    this.seen.push({ stage, data })
    if (stage === 'assess_match' && this.parserFailure) {
      this.parserFailure = false
      throw new OutputParserException('Invalid structured output')
    }
    const d = data as {
      facts: Fact[]
      text: string
      jd: string
      job: { title: string }
      target?: Fact
    }
    let result: unknown
    if (stage === 'extract_profile')
      result = {
        drafts: [
          {
            category: d.target?.category || 'project',
            title: d.target?.title || 'Vue 工作台',
            content: d.text,
          },
        ],
      }
    else if (stage === 'analyze_jd')
      result = { keywords: [d.jd.includes('Python') ? 'Python' : 'Vue'] }
    else if (stage === 'assess_match')
      result = {
        requirements: [
          {
            requirement: '相关项目经验',
            factIds: this.invalidAnalysisCount-- > 0 ? ['invented'] : d.facts.map((f) => f.id),
            assessment: '有已确认的实现经历，效果指标尚未提供。',
          },
        ],
        questions: ['是否有已确认的效果指标？没有可以跳过。'],
      }
    else if (stage === 'generate_resume') {
      if (this.failOnce) {
        this.failOnce = false
        throw new Error('simulated timeout')
      }
      result = {
        headline: d.job.title,
        sections: [
          { title: '项目经历', items: d.facts.map((f) => ({ text: f.content, factIds: [f.id] })) },
        ],
        greetings: ['简洁直接', '项目匹配', '自然交流'].map((style) => ({
          style,
          text: `您好，我有${d.facts[0]!.title}的相关经历，希望进一步交流。`,
          factIds: [d.facts[0]!.id],
        })),
      }
    } else if (stage === 'verify_facts')
      result = { supported: !this.unsupported, issues: this.unsupported ? ['出现无依据指标'] : [] }
    else throw new Error(`Unknown stage ${stage}`)
    return schema.parse(result)
  }
  async call(messages: BaseMessage[]) {
    if (!messages.some((m) => m.type === 'tool')) {
      const query = JSON.parse(String(messages.at(-1)!.content)).keywords[0]
      return new AIMessage({
        content: '',
        tool_calls: [{ name: 'search_facts', args: { query }, id: 'search-1', type: 'tool_call' }],
      })
    }
    return new AIMessage('已完成检索。')
  }
}
