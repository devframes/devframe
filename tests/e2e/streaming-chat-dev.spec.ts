import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:9897/__devframe-streaming-chat/'

// Shared server-side history means parallel browsers see each other's
// messages — pin the suite to serial so each test starts from a clean
// `clear()` and exits with its stream settled.
test.describe.configure({ mode: 'serial' })

test.describe('streaming-chat (dev)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Streaming Chat')
    await expect(page.locator('.demo-prompts button').first()).toBeVisible()

    const clearBtn = page.locator('.toolbar button:has-text("Clear")')
    if (await clearBtn.isEnabled())
      await clearBtn.click()
    await expect(page.locator('.msg')).toHaveCount(0)
  })

  test('demo prompt streams tokens into a message', async ({ page }) => {
    await page.click('.demo-prompts button:has-text("Write a haiku about RPC.")')

    await expect(page.locator('.msg-user').last())
      .toHaveText('Write a haiku about RPC.')

    await expect(page.locator('.msg-assistant').last())
      .toContainText('Tiny chunks arrive', { timeout: 10_000 })

    await expect(page.locator('.msg-assistant.streaming')).toHaveCount(0, {
      timeout: 10_000,
    })
  })

  test('clear button resets history', async ({ page }) => {
    await page.click('.demo-prompts button:has-text("Write a haiku about RPC.")')
    await expect(page.locator('.msg-assistant').last())
      .toContainText('Tiny chunks arrive', { timeout: 10_000 })
    await expect(page.locator('.msg-assistant.streaming')).toHaveCount(0)

    await page.locator('.toolbar button:has-text("Clear")').click()

    await expect(page.locator('.msg')).toHaveCount(0)
    await expect(page.locator('.status')).toContainText('0 messages')
  })
})
