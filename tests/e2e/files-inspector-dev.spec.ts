import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:9876/__devframe-files-inspector/'

test.describe('files-inspector (dev)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('.df-nav-brand')).toHaveText('Files Inspector')
  })

  test('lists fixture files on home', async ({ page }) => {
    await expect(page.locator('section h2')).toContainText('Files')
    await expect(page.locator('section span[class*="df-badge-"]')).toHaveText('3')
    await expect(page.locator('section ul li')).toHaveText([
      'README.md',
      'package.json',
      'sample.txt',
    ])
  })

  test('navigates to about and shows cwd', async ({ page }) => {
    await page.click('button:has-text("About")')
    await expect(page.locator('section h2')).toHaveText('About')

    const cwdValue = page.locator('dt:has-text("Server cwd") + dd')
    await expect(cwdValue).toContainText(/fixtures$/)
  })
})
