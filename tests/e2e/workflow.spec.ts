import { test, expect } from '@playwright/test'
import { PDFParse } from 'pdf-parse'
import { readFile } from 'node:fs/promises'

test('import → confirmation → JD → interruption → edit → Chinese PDF', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '导入资料', exact: true }).click()
  await page
    .getByRole('dialog')
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'experience.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('独立使用 Vue 和 TypeScript 开发资料工作台，实现资料编辑和版本管理。'),
    })
  await page.getByRole('button', { name: '上传并整理', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认入库', exact: true })).toBeVisible()
  await expect(page.getByTestId('fact-row')).toHaveCount(0)
  await page.getByRole('button', { name: '确认入库', exact: true }).click()
  await expect(page.getByTestId('fact-row')).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId('fact-row')).toHaveCount(1)
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
  await page.getByRole('heading', { name: '定制简历', exact: true }).scrollIntoViewIfNeeded()
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

test('Nuxt UI forms, profile filters, theme and mobile navigation', async ({ page }) => {
  await page.goto('/')
  const manual = page.getByRole('button', { name: '手动录入', exact: true }).first()
  await manual.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '保存为草稿' }).click()
  await expect(dialog.getByLabel('标题', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await dialog.getByLabel('标题', { exact: true }).fill('Nuxt UI 回归资料')
  await dialog.getByLabel('经历内容').fill('实现可访问的表单和移动端导航。')
  await dialog.getByRole('button', { name: '保存为草稿' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /待确认草稿/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('button', { name: '确认入库' }).click()
  await page.getByRole('textbox', { name: '搜索资料' }).fill('Nuxt UI 回归资料')
  const row = page.getByTestId('fact-row')
  await expect(row).toHaveCount(1)
  await page.getByRole('combobox', { name: '筛选资料类别' }).click()
  await page.getByRole('option', { name: '教育', exact: true }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('combobox', { name: '筛选资料类别' }).click()
  await page.getByRole('option', { name: '项目', exact: true }).click()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  await dialog.getByRole('checkbox', { name: '允许用于生成', exact: true }).uncheck()
  await dialog.getByRole('button', { name: '保存修改' }).click()
  await expect(row.getByText('已排除', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: '版本记录' }).click()
  await expect(dialog.getByRole('heading', { name: '版本记录' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(row.getByRole('button', { name: '版本记录' })).toBeFocused()
  await page.getByRole('button', { name: '切换到深色模式' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: '.qa/library-dark.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开侧边栏' }).click()
  await page.getByRole('link', { name: '职位工作台', exact: true }).click()
  await expect(page.getByRole('heading', { name: '职位工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭侧边栏' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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
