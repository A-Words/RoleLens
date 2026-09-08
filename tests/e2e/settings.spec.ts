import { test, expect } from '@playwright/test'

test('settings show missing configuration without ENV or a global warning', async ({
  page,
  request,
}) => {
  const view = await (await request.get('/api/settings')).json()
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      json: {
        ...view,
        configured: false,
        overrides: [],
        secrets: { apiKey: false, langfusePublicKey: false, langfuseSecretKey: false },
      },
    }),
  )
  await page.goto('/jobs')
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await expect(page.getByText('待补全配置', { exact: true })).toBeVisible()
  await expect(page.getByText('API Key 未配置。', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '测试当前连接' })).toBeDisabled()
  await expect(page.getByText('ENV 接管', { exact: true })).toHaveCount(0)
  await expect(page.getByText('尚未连接模型', { exact: true })).toHaveCount(0)
})

test('settings distinguish ENV from local values, save and preserve failed input', async ({
  page,
  request,
}) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('设置')
  for (const name of ['外观', '模型与服务', '开发工具', '数据与隐私']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByText('配置完整', { exact: true })).toBeVisible()
  await expect(page.getByText('连接未验证', { exact: true })).toBeVisible()
  await expect(page.getByText('API Key 已配置。', { exact: false })).toBeVisible()
  await expect(page.getByText('ENV 接管', { exact: true })).toHaveCount(4)
  await expect(page.getByRole('textbox', { name: 'API Key', exact: true })).toHaveValue('')
  await expect(page.getByText('当前生效（ENV）：fixture。', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '测试当前连接' }).click()
  await expect(page.getByRole('status').filter({ hasText: '连接成功' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Model', exact: true }).fill('local-backup-model')
  await expect(page.getByRole('button', { name: '测试当前连接' })).toBeDisabled()
  await expect(page.getByText('连接成功', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('已保存本地配置。', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Model', exact: true })).toHaveValue(
    'local-backup-model',
  )
  const view = await (await request.get('/api/settings')).json()
  expect(view.overrides).toContain('model')
  expect(view.configured).toBe(true)
  await page.screenshot({ path: '.qa/settings-refined-light.png', fullPage: true })
  await page.getByText('深色', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '深色', exact: true })).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: '.qa/settings-refined-dark.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.qa/settings-refined-mobile.png', fullPage: true })
  await page.getByRole('heading', { name: '数据与隐私' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.qa/settings-privacy-mobile.png', fullPage: true })
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, json: { message: 'fixture failure' } })
    } else await route.continue()
  })
  await page.getByRole('textbox', { name: 'API Key', exact: true }).fill('unsaved-fixture-key')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('输入已保留')
  await expect(page.getByRole('textbox', { name: 'API Key', exact: true })).toHaveValue(
    'unsaved-fixture-key',
  )
})
