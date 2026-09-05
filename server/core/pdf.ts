import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { Resume } from '../../shared/types'

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
let fontCss: string | undefined
function fonts() {
  if (fontCss) return fontCss
  const require = createRequire(import.meta.url)
  const path = require.resolve('@fontsource/noto-sans-sc/400.css')
  fontCss = readFileSync(path, 'utf8').replace(/url\(([^)]+)\)/g, (_, url: string) => {
    const bytes = readFileSync(resolve(dirname(path), url.replace(/['"]/g, '')))
    return `url(data:font/woff2;base64,${bytes.toString('base64')})`
  })
  return fontCss
}
export function resumeHtml(resume: Resume, contacts: string[] = []) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${fonts()}
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:'Noto Sans SC',sans-serif;color:#18213a;font-size:10pt;line-height:1.7;margin:0}h1{font-size:20pt;margin:0 0 8pt}h2{font-size:12pt;border-bottom:1px solid #cbd5e1;padding-bottom:5pt;margin:16pt 0 8pt;break-after:avoid}p{margin:0 0 6pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}li{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:7pt;break-inside:avoid}ul{padding-left:16pt}.contact{font-size:9pt;color:#475569}</style>
  <h1>${escape(resume.headline)}</h1>${contacts.map((c) => `<p class="contact">${escape(c)}</p>`).join('')}
  ${resume.sections.map((s) => `<section><h2>${escape(s.title)}</h2><ul>${s.items.map((i) => `<li>${escape(i.text)}</li>`).join('')}</ul></section>`).join('')}</html>`
}
export async function exportPdf(resume: Resume, contacts: string[]) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.route('**/*', (route) => route.abort())
    await page.setContent(resumeHtml(resume, contacts), { waitUntil: 'load' })
    await page.evaluate('document.fonts.ready')
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    await browser.close()
  }
}
