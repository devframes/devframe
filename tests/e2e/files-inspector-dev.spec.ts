import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:9876/__devframe-files-inspector/'

test.describe('files-inspector (dev)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Files Inspector')
  })

  test('lists fixture files on home', async ({ page }) => {
    await expect(page.locator('section h2')).toContainText('Files')
    await expect(page.locator('section h2 small')).toHaveText('(3)')
    await expect(page.locator('section ul li')).toHaveText([
      'README.md',
      'package.json',
      'sample.txt',
    ])
  })

  test('navigates to about and shows cwd', async ({ page }) => {
    await page.click('a:has-text("About")')
    await expect(page.locator('section h2')).toHaveText('About')

    const cwdValue = page.locator('dt:has-text("Server cwd") + dd code')
    await expect(cwdValue).toContainText(/fixtures$/)
  })
})
