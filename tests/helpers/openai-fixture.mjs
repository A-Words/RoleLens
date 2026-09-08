import { createServer } from 'node:http'
// Local OpenAI-compatible fixture. It is never selected by application code.
const server = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.end('fixture ready')
    return
  }
  try {
    let body = ''
    for await (const chunk of req) body += chunk
    const request = JSON.parse(body),
      messages = request.messages
    const forced = request.tool_choice?.function?.name
    if (messages?.[0]?.content === 'Reply with only OK.') {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'probe',
          object: 'chat.completion',
          created: 1,
          model: request.model,
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
        }),
      )
      return
    }
    let name = forced || request.tools?.[0]?.function?.name
    let output,
      toolCall = true
    const data = JSON.parse(messages.findLast((m) => m.role === 'user')?.content || '{}')
    if (name === 'extract_profile')
      output = {
        drafts: [
          {
            category: data.target?.category || 'project',
            title: data.target?.title || 'Vue 工作台',
            content: data.text,
          },
        ],
      }
    else if (name === 'analyze_jd')
      output = { keywords: [data.jd.includes('Python') ? 'Python' : 'Vue'] }
    else if (name === 'search_facts') {
      if (messages.some((m) => m.role === 'tool')) {
        toolCall = false
        output = '检索完成。'
      } else output = { query: data.keywords[0] }
    } else if (name === 'assess_match')
      output = {
        requirements: [
          {
            requirement: '相关技术与项目经验',
            factIds: data.facts.map((f) => f.id),
            assessment: '具备对应实现经历，效果指标尚未确认。',
          },
        ],
        questions: ['是否有已确认的效果指标？没有可以跳过。'],
      }
    else if (name === 'generate_resume')
      output = {
        headline: data.job.title,
        sections: [
          {
            title: '项目经历',
            items: data.facts.map((f) => ({ text: f.content, factIds: [f.id] })),
          },
        ],
        greetings: ['简洁直接', '项目匹配', '自然交流'].map((style) => ({
          style,
          text: `您好，我有${data.facts[0].title}的相关经历，希望进一步交流。`,
          factIds: [data.facts[0].id],
        })),
      }
    else if (name === 'verify_facts') output = { blockingIssues: [], notes: [] }
    else throw new Error(`Unknown fixture tool: ${name}`)
    const message = toolCall
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(output) },
            },
          ],
        }
      : { role: 'assistant', content: output }
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        id: 'fixture',
        object: 'chat.completion',
        created: 1,
        model: 'fixture',
        choices: [{ index: 0, message, finish_reason: toolCall ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
  } catch (e) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: { message: String(e) } }))
  }
})
server.listen(4318, '127.0.0.1', () => console.log('Local model fixture listening on 4318'))
