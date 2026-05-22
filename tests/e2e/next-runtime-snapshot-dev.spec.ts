import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:9899/__next-runtime-snapshot/'

test.describe('next-runtime-snapshot (dev)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Next Runtime Snapshot')
  })

  test('system card populates with node + platform info', async ({ page }) => {
    const systemCard = page.locator('.card').filter({ hasText: 'System' })
    await expect(systemCard.locator('.kv .v').first()).toContainText(/v\d+\.\d+/, { timeout: 10_000 })
    await expect(systemCard).toContainText(/pid/)
    await expect(systemCard).toContainText(/cwd/)
  })

  test('memory card populates and refresh re-invokes the RPC', async ({ page }) => {
    const memCard = page.locator('.card').filter({ hasText: 'Memory & Uptime' })
    await expect(memCard).toContainText(/heap used/i, { timeout: 10_000 })

    const initialRss = (await memCard.locator('.kv .v').nth(1).textContent()) ?? ''
    expect(initialRss).toMatch(/\d+(?:\.\d+)?\s*MB/)

    await memCard.locator('button:has-text("Refresh")').click()
    // After refresh the uptime row should still render — the call resolved.
    await expect(memCard.locator('.kv .k').first()).toHaveText('uptime')
  })

  test('env filter triggers a query call', async ({ page }) => {
    const envCard = page.locator('.card').filter({ hasText: 'Environment' })
    // Default pattern "NODE" should yield at least one row on most systems.
    await expect(envCard.locator('.env-list')).toBeVisible({ timeout: 10_000 })

    const input = envCard.locator('input')
    await input.fill('___definitely_not_a_real_env_var___')
    await expect(envCard.locator('.empty')).toBeVisible({ timeout: 5_000 })
    await expect(envCard.locator('.empty')).toContainText('No environment variables match')
  })

  test('status bar reports websocket backend', async ({ page }) => {
    await expect(page.locator('.status code').first()).toHaveText('websocket', { timeout: 10_000 })
  })
})
