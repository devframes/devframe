import process from 'node:process'
import { expect, test } from '@playwright/test'

// Exercises the single playground end to end: the vanilla-TS SPA connects
// over the real WebSocket RPC bridge and renders the `get-state` result for
// the fixed `./fixtures` directory (wired via `playwright.config.ts`'s
// `webServer.env.DEVFRAME_E2E_CWD`).
test('connects and renders the list of items', async ({ page }) => {
  await page.goto('/')

  const list = page.locator('ul')
  await expect(list).toBeVisible()

  const items = list.locator('li')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('dir1')
  await expect(items.nth(0)).toContainText('dir')
  await expect(items.nth(1)).toContainText('file1.txt')
  await expect(items.nth(1)).toContainText('file')

  // The "node" info line renders from the same `get-state` call.
  await expect(page.locator('.meta code').first()).toContainText(process.version)
})

test('refresh re-fetches the list without a page reload', async ({ page }) => {
  await page.goto('/')

  const refreshButton = page.getByRole('button', { name: 'Refresh' })
  await expect(refreshButton).toBeEnabled()
  await refreshButton.click()

  await expect(page.locator('ul li')).toHaveCount(2)
})
