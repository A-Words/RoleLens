import { test, expect } from '@playwright/test'
import { PDFParse } from 'pdf-parse'
import { readFile } from 'node:fs/promises'

test('import → confirmation → JD → interruption → edit → Chinese PDF', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '导入资料', exact: true }).click()
  await page.getByLabel('资料文件').setInputFiles({
    name: 'experience.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('独立使用 Vue 和 TypeScript 开发资料工作台，实现资料编辑和版本管理。'),
  })
  await page.getByRole('button', { name: '上传并整理', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认入库', exact: true })).toBeVisible()
  await expect(page.locator('.fact-row')).toHaveCount(0)
  await page.getByRole('button', { name: '确认入库', exact: true }).click()
  await expect(page.locator('.fact-row')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.fact-row')).toHaveCount(1)
  await page.screenshot({ path: '.qa/library-desktop.png', fullPage: true })
  await page.getByRole('link', { name: '职位工作台' }).click()
  await page.getByRole('button', { name: '添加职位', exact: true }).click()
  await page.getByLabel('公司', { exact: true }).fill('测试科技')
  await page.getByLabel('职位名称', { exact: true }).fill('前端开发工程师')
  await page
    .getByLabel('职位描述（JD）')
    .fill('需要 Vue 和 TypeScript 开发经验，负责内部工作台和资料编辑功能。')
  await page.getByRole('button', { name: '保存职位' }).click()
  await page.getByRole('button', { name: '开始分析', exact: true }).click()
  await expect(
    page.getByText('是否有已确认的效果指标？没有可以跳过。', { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 })
  await page.reload()
  await expect(page.getByRole('button', { name: '继续生成', exact: true })).toBeVisible()
  await page.getByLabel('你的补充').fill('请突出我已经确认的前端实现，不添加数字。')
  await page.getByRole('button', { name: '继续生成', exact: true }).click()
  await expect(page.getByRole('heading', { name: '定制简历', exact: true })).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByRole('heading', { name: '专属打招呼语' })).toBeVisible()
  await expect(page.getByText('读取来源', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: '编辑内容', exact: true }).click()
  await page
    .getByLabel('简历条目 1-1')
    .fill('使用 Vue 和 TypeScript 开发资料工作台，实现资料编辑和版本管理。')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByText('已手动编辑 · 请自行核对')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 PDF' }).click()
  const download = await downloadPromise,
    path = await download.path()
  expect(await download.failure()).toBeNull()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  const parser = new PDFParse({ data: bytes })
  try {
    const parsed = await parser.getText()
    expect(parsed.text).toContain('资料工作台')
    expect(parsed.total).toBeLessThanOrEqual(2)
  } finally {
    await parser.destroy()
  }
  await page.screenshot({ path: '.qa/job-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '定制简历', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.qa/job-mobile.png', fullPage: true })
  expect(errors).toEqual([])
  await page.getByRole('button', { name: '删除版本', exact: true }).click()
  await page.getByRole('button', { name: '确认删除版本', exact: true }).click()
  await expect(page.getByRole('heading', { name: '定制简历', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '定制简历', exact: true })).toHaveCount(0)
})

test('local API rejects cross-site mutation and invalid inputs', async ({ request }) => {
  expect(
    (
      await request.post('/api/jobs', {
        headers: { origin: 'https://example.com' },
        data: { company: 'x', title: 'y', jd: 'abcdefghi0123' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (await request.post('/api/jobs', { data: { company: '', title: '', jd: '' } })).status(),
  ).toBe(400)
})
