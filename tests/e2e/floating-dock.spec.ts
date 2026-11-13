import type { Locator } from '@playwright/test'
import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { createServer } from 'vite'
import { alias } from '../../alias'

let server: ViteDevServer
let origin: string

test.beforeAll(async ({ browserName }, { workerIndex }) => {
  server = await createServer({
    configFile: fileURLToPath(new URL('../../packages/hub-ui/vite.embedded.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('./_support/floating-dock', import.meta.url)),
    cacheDir: fileURLToPath(new URL(`../../node_modules/.vite/floating-dock/${browserName}-${workerIndex}`, import.meta.url)),
    resolve: { alias },
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  origin = server.resolvedUrls!.local[0]
})

test.afterAll(async () => {
  await server?.close()
})

async function center(locator: Locator): Promise<{ x: number, y: number }> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

for (const trusted of [false, true]) {
  test.describe(trusted ? 'trusted floating dock' : 'unauthorized floating dock', () => {
    const name = trusted ? 'Settings' : 'Unauthorized'

    test.beforeEach(async ({ page }) => {
      await page.clock.install()
      await page.goto(`${origin}?${trusted ? 'trusted' : ''}`)
      await expect(page.locator('#devframes-dock')).toBeVisible()
    })

    for (const vertical of [false, true]) {
      test(`center pointer click activates the visible control (${vertical ? 'vertical' : 'horizontal'})`, async ({ page }) => {
        if (vertical)
          await page.goto(`${origin}?${trusted ? 'trusted&' : ''}vertical`)
        const dock = page.locator('#devframes-dock')
        await dock.hover()
        await expect(page.locator('#devframes-anchor')).not.toHaveClass(/devframes-minimized/)
        const button = dock.getByRole('button', { name, exact: true })
        // Wait for expansion so the click lands beneath the centered logo.
        await expect(button).toBeInViewport()
        const logo = dock.locator(':scope > div').first()
        await expect(logo).toHaveCSS('opacity', '0')
        await expect(dock.locator(':scope > div').last()).toHaveCSS('opacity', '1')
        expect(await logo.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const root = el.getRootNode() as ShadowRoot
          return root.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            .some(target => el.contains(target))
        })).toBe(false)
        const point = await center(button)
        await page.mouse.click(point.x, point.y)
        await expect(page.locator('body')).toHaveAttribute('data-open', 'true')
        await expect(page.locator('body')).toHaveAttribute('data-selected', trusted ? '~settings' : '~client-auth-notice')
      })
    }

    test('minimized controls leave the accessibility tree and tab order', async ({ page }) => {
      const dock = page.locator('#devframes-dock')
      await dock.hover()
      await expect(dock.getByRole('button', { name, exact: true })).toHaveCount(1)
      await page.mouse.move(0, 0)
      await page.clock.fastForward(31_000)
      await expect(page.locator('#devframes-anchor')).toHaveClass(/devframes-minimized/)
      await expect(dock.getByRole('button')).toHaveCount(0)
      const hidden = dock.locator('button').first()
      await hidden.evaluate(el => el.focus())
      await expect(hidden).not.toBeFocused()
      await page.locator('#before').focus()
      await page.keyboard.press('Tab')
      await expect(page.locator('#after')).toBeFocused()

      await dock.hover()
      await expect(dock.getByRole('button', { name, exact: true })).toHaveCount(1)
      await dock.getByRole('button', { name, exact: true }).focus()
      await expect(dock.getByRole('button', { name, exact: true })).toBeFocused()
    })

    test('keeps focused controls available past the inactivity timeout', async ({ page }) => {
      const dock = page.locator('#devframes-dock')
      await dock.hover()
      const button = dock.getByRole('button', { name, exact: true })
      await button.focus()
      await page.mouse.move(0, 0)
      await page.clock.fastForward(31_000)
      await expect(button).toBeFocused()
      await expect(page.locator('#devframes-anchor')).not.toHaveClass(/devframes-minimized/)

      await page.locator('#before').focus()
      await expect(page.locator('#devframes-anchor')).toHaveClass(/devframes-minimized/)
      await expect(dock.getByRole('button')).toHaveCount(0)
    })

    test('minimized dock remains draggable', async ({ page }) => {
      const anchor = page.locator('#devframes-anchor')
      await page.clock.fastForward(31_000)
      await expect(anchor).toHaveClass(/devframes-minimized/)
      const point = await center(page.locator('#devframes-dock'))
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(20, 300, { steps: 10 })
      await page.mouse.up()
      await expect(anchor).toHaveClass(/devframes-vertical/)
    })
  })
}
