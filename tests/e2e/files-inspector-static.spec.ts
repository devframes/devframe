import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:9886/'

test.describe('files-inspector (static build)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Files Inspector')
  })

  test('renders the file list from the static RPC dump', async ({ page }) => {
    await expect(page.locator('section h2 small')).toHaveText('(3)')
    await expect(page.locator('section ul li')).toHaveText([
      'README.md',
      'package.json',
      'sample.txt',
    ])
  })

  test('reports static backend on the About page', async ({ page }) => {
    await page.click('a:has-text("About")')
    await expect(page.locator('section h2')).toHaveText('About')

    await expect(
      page.locator('dt:has-text("RPC backend") + dd code'),
    ).toHaveText('static')
    await expect(
      page.locator('dt:has-text("Server cwd") + dd code'),
    ).toContainText(/fixtures$/)
  })
})
