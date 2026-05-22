import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:9889/'

// Static dumps only carry pre-computed `static` (and `query{snapshot:true}`)
// RPC results. The example's `system` function is `static` so it bakes
// into the dump; `memory` and `env` are live `query`s with no `snapshot`,
// so they don't render anything in static mode — the cards stay in their
// "Loading…" placeholder.

test.describe('next-runtime-snapshot (static build)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Next Runtime Snapshot')
  })

  test('renders system info from the static RPC dump', async ({ page }) => {
    const systemCard = page.locator('.card').filter({ hasText: 'System' })
    await expect(systemCard.locator('.kv .v').first()).toContainText(/v\d+\.\d+/, { timeout: 10_000 })
    await expect(systemCard).toContainText(/cwd/)
  })

  test('reports static backend in the status bar', async ({ page }) => {
    await expect(page.locator('.status code').first()).toHaveText('static', { timeout: 10_000 })
  })
})
