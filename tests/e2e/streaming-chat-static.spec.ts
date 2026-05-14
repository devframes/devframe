import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:9898/'

// Static dumps only carry pre-computed `static` / `query{snapshot:true}`
// RPC results. streaming-chat's `send` and `clear` are `action` functions
// so they never run from a static build — these specs cover what *does*
// render: the demo-prompts list (static RPC) and the connection meta.

test.describe('streaming-chat (static build)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toHaveText('Streaming Chat')
  })

  test('renders demo prompts from the static RPC dump', async ({ page }) => {
    const prompts = page.locator('.demo-prompts button')
    await expect(prompts).toHaveCount(3)
    await expect(prompts).toHaveText([
      'Tell me about devframe.',
      'How does streaming work?',
      'Write a haiku about RPC.',
    ])
  })

  test('reports static backend in the status bar', async ({ page }) => {
    await expect(page.locator('.status code').first()).toHaveText('static')
    await expect(page.locator('.status')).toContainText('0 messages')
  })
})
