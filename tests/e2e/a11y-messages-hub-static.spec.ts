import { expect, test } from '@playwright/test'

const BASE = 'http://127.0.0.1:9885/'

/**
 * The hub's static build (`buildHub` baked into `vite build` output, served
 * by a plain static file server): the client runtime boots against the
 * `static` backend, imports the a11y page script into the production page,
 * and the panels work from the baked RPC dump plus the in-page channel.
 */
test.describe('a11y-messages playground (static hub build)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('#conn')).toContainText('backend=static')
  })

  test('renders the dock rail from the baked shared state', async ({ page }) => {
    await expect(page.locator('button[data-dock-id="devframes_plugin_a11y"]')).toBeVisible()
    await expect(page.locator('button[data-dock-id="devframes_plugin_messages"]')).toBeVisible()
  })

  test('a11y page script scans the production page; the panel highlights over the in-page channel', async ({ page }) => {
    const panel = page.frameLocator('iframe[title="A11y Inspector"]')

    // The panel connects statically and receives the page script's scan of
    // the app under test (seeded with violations) over the in-page channel.
    await expect(panel.getByText('static', { exact: true })).toBeVisible()
    const imageAlt = panel.getByRole('checkbox', { name: /image-alt/ })
    await expect(imageAlt).toBeVisible()

    // Pinning a violation rings the offending element in the host page: the
    // page script draws its overlay into the production DOM.
    await imageAlt.check()
    await expect(page.locator('[data-df-a11y-overlay]')).toContainText('image-alt')
  })

  test('keeps the a11y summary controls above scrolled violations', async ({ page }) => {
    await page.setViewportSize({ width: 1_000, height: 360 })
    const panel = page.frameLocator('iframe[title="A11y Inspector"]')

    await expect(panel.getByRole('checkbox', { name: /image-alt/ })).toBeVisible()
    const scrollArea = panel.locator('#a11y-scroll')
    const summary = scrollArea.locator(':scope > div').first()
    await scrollArea.evaluate(element => element.scrollTo({ top: element.scrollHeight }))

    expect(await scrollArea.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect(await summary.locator('button').evaluateAll(buttons => buttons.flatMap((button) => {
      const bounds = button.getBoundingClientRect()
      const hitTarget = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      )
      return hitTarget != null && button.contains(hitTarget)
        ? []
        : [button.getAttribute('aria-label') ?? button.title ?? button.textContent?.trim()]
    }))).toEqual([])

    const critical = panel.getByRole('button', { name: /Critical issues/ })
    await critical.click()
    await expect(critical).toHaveAttribute('aria-pressed', 'true')
  })

  test('messages panel renders the baked feed; its activate action switches docks over the BroadcastChannel', async ({ page }) => {
    await page.click('button[data-dock-id="devframes_plugin_messages"]')
    const panel = page.frameLocator('iframe[title="Messages"]')

    // The entry baked by the playground's `buildHub({ configure })`.
    await panel.getByText('Static hub build').click()

    // Its activate action rides the same-origin BroadcastChannel (no live
    // server on a static backend) and the host page switches the dock.
    await panel.getByRole('button', { name: 'Open a11y inspector' }).click()
    await expect(page.locator('iframe[title="A11y Inspector"]')).toBeVisible()
    await expect(page.locator('iframe[title="Messages"]')).toBeHidden()
  })
})
