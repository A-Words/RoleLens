import { test, expect } from 'vitest'
import JSZip from 'jszip'
import { chromium } from 'playwright'
import { PDFParse } from 'pdf-parse'
import { extractText } from '../server/core/import'
import { exportPdf, resumeHtml } from '../server/core/pdf'
import type { Resume } from '../shared/types'

test('text and DOCX extraction preserves Chinese content and rejects unsupported files', async () => {
  const text = '使用 Vue 和 TypeScript 开发个人资料工作台。'
  expect(await extractText('experience.md', Buffer.from(text))).toBe(text)
  expect(await extractText('experience.txt', Buffer.from(text))).toBe(text)
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  )
  expect(
    await extractText('experience.docx', await zip.generateAsync({ type: 'nodebuffer' })),
  ).toContain(text)
  await expect(extractText('image.png', Buffer.from('x'))).rejects.toThrow('支持')
  await expect(extractText('empty.txt', Buffer.from('   '))).rejects.toThrow('没有可提取')
  await expect(extractText('big.txt', Buffer.alloc(11 * 1024 * 1024))).rejects.toThrow('10 MB')
})
test('PDF includes searchable Chinese, escapes HTML and paginates long content without loss', async () => {
  const resume: Resume = {
    headline: '前端开发工程师',
    sections: [
      {
        title: '项目经历',
        items: Array.from({ length: 28 }, (_, i) => ({
          text: `经历${i + 1}：使用 Vue 和 TypeScript 开发资料工作台，实现文档导入、资料编辑和版本管理，负责完整的浏览器交互验证。`,
          factIds: ['f'],
        })),
      },
    ],
    greetings: [],
  }
  const html = resumeHtml({ ...resume, headline: '<script>bad()</script>' })
  expect(html).not.toContain('<script>bad')
  expect(html).toContain('&lt;script&gt;')
  const bytes = await exportPdf(resume, ['事实：候选人 · example@example.com'])
  const parser = new PDFParse({ data: bytes })
  try {
    const result = await parser.getText()
    expect(result.total).toBeGreaterThan(1)
    expect(result.text).toContain('经历28')
    expect(result.text).toContain('前端开发工程师')
    expect(result.text).toContain('example@example.com')
    expect(result.text).not.toContain('事实：')
    expect(await extractText('resume.pdf', bytes)).toContain('资料工作台')
  } finally {
    await parser.destroy()
  }
})
test('image-only PDF receives an actionable scan message', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<div style="width:300px;height:300px;background:#333"></div>')
    await expect(extractText('scan.pdf', await page.pdf())).rejects.toThrow('扫描件')
  } finally {
    await browser.close()
  }
})
