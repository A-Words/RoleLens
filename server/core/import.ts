import { extname } from 'node:path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { z } from 'zod'
import { factInput } from '../../shared/types'
import { AppError, type Store } from './store'
import type { ModelPort } from './model'
import { prompts } from './prompts'
import { createProfileDraftTool } from './tools'

export async function extractText(name: string, data: Buffer): Promise<string> {
  if (data.length > 10 * 1024 * 1024) throw new AppError(413, '文件不得超过 10 MB')
  const ext = extname(name).toLowerCase()
  let text: string
  if (['.txt', '.md'].includes(ext)) text = data.toString('utf8')
  else if (ext === '.docx') text = (await mammoth.extractRawText({ buffer: data })).value
  else if (ext === '.pdf') {
    const parser = new PDFParse({ data })
    try {
      text = (await parser.getText()).pages.map((p) => p.text).join('\n')
    } finally {
      await parser.destroy()
    }
    if (text.replace(/\s/g, '').length < 15)
      throw new AppError(
        422,
        '此 PDF 没有足够可提取文字，可能是扫描件。请改用文字型 PDF 或粘贴文本。',
      )
  } else throw new AppError(415, '支持 PDF、DOCX、Markdown 和 TXT')
  if (!text.trim()) throw new AppError(422, '资料没有可提取文本')
  if (text.length > 60000) throw new AppError(413, '资料文字超过 60000 字，请分段导入')
  return text.trim()
}
export async function importDrafts(
  store: Store,
  model: ModelPort,
  text: string,
  name: string,
  targetId?: string,
  file?: Buffer,
) {
  const target = targetId ? store.fact(targetId) : null
  const schema = z.object({
    drafts: z
      .array(factInput.omit({ enabled: true }))
      .min(1)
      .max(30),
  })
  const result = await model.structured(schema, 'extract_profile', {
    instruction: prompts.extractProfile,
    text,
    target,
  })
  if (target && result.drafts.length !== 1)
    throw new AppError(422, '修改应产生一条完整草稿，请重试')
  // A failed model call never commits a partially imported source.
  const propose = createProfileDraftTool(store, {
    name,
    text,
    targetId,
    drafts: result.drafts,
    file,
  })
  return await propose.invoke({})
}
