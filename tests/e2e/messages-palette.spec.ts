import type { DevframeDocksUserSettings } from '@devframes/hub'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createUi } from '@devframes/hub-ui'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { initHub } from '@devframes/hub/initiate'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { test as base, expect } from '@playwright/test'

const test = base.extend<{
  viewer: { hub: ReturnType<typeof initHub>, origin: string, checkpoints: number[], count: () => number }
}>({
  viewer: async ({ page }, use, testInfo) => {
    let calls = 0
    const checkpoints: number[] = []
    const hub = initHub({
      base: '/__devframes/',
      auth: false,
      mcp: false,
      register: false,
      getStorageDir: scope => testInfo.outputPath('storage', scope),
      ui: createUi({ locale: 'en' }),
      devframes: [
        createMessagesDevframe(),
      ],
      configure(ctx) {
        ctx.messages.add({ level: 'info', message: 'Build complete' })
        ctx.commands.register({
          id: 'test:count',
          title: 'Count invocations',
          keybindings: [
            { key: 'Mod+K' },
          ],
          handler: () => ++calls,
        })
        // This command takes a snapshot after earlier shortcut calls reach the server.
        ctx.commands.register({
          id: 'test:checkpoint',
          title: 'Record invocation count',
          keybindings: [
            { key: 'F8' },
          ],
          handler: () => checkpoints.push(calls),
        })
      },
    })
    const server = createServer((req, res) => {
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html')
        res.end(`<!doctype html><input aria-label="Host input"><iframe title="Other panel" srcdoc="<input>"></iframe><script type="module" src="${hub.base}embedded.js"></script>`)
        return
      }
      hub.nodeMiddleware(req, res)
    })
    const detach = hub.attach(server)
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const { port } = server.address() as AddressInfo
      await use({
        hub,
        origin: `http://127.0.0.1:${port}`,
        checkpoints,
        count: () => calls,
      })
    }
    finally {
      await page.close()
      detach()
      await hub.close()
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
  },
})

test('opens the palette once from Messages when another command shares its shortcut', async ({ page, viewer }) => {
  const { hub, origin, checkpoints, count } = viewer
  await page.goto(origin + hub.base)
  await page.getByRole('button', { name: 'Messages', exact: true }).click()
  const panel = page.frameLocator('iframe[title="Messages"]')
  await panel.getByText('Build complete', { exact: true }).click()
  await page.keyboard.down('ControlOrMeta')
  await page.keyboard.down('k')
  const palette = page.getByPlaceholder('Type a command...')
  await expect(palette).toBeFocused()

  // The repeat reaches the focused palette. A fresh press goes through the normal command order.
  await page.keyboard.down('k')
  await page.keyboard.up('k')
  await page.keyboard.up('ControlOrMeta')
  await expect(palette).toBeFocused()
  await page.keyboard.press('F8')
  await expect.poll(() => checkpoints).toEqual([0])
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.press('F8')
  await expect.poll(() => checkpoints).toEqual([0, 1])
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()

  const search = panel.getByRole('searchbox')
  await search.click()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(search).toBeFocused()
  await expect(palette).toBeHidden()
  expect(count()).toBe(1)
})

test('keeps a held palette shortcut separate from the embedded dock shortcut', async ({ page, viewer }) => {
  const ctx = await viewer.hub.context
  const settings = await ctx.rpc.sharedState.get<DevframeDocksUserSettings>(HUB_EVENTS.sharedState.userSettings)
  settings.mutate((state) => {
    state.commandShortcuts['devframes:toggle-palette'] = [
      { key: 'Alt+Shift+D' },
    ]
  })
  await page.goto(viewer.origin)
  const dock = page.locator('#devframes-dock')
  await dock.hover()
  await page.getByRole('button', { name: 'Messages', exact: true }).click()
  const panel = page.frameLocator('iframe[title="Messages"]')
  await panel.getByText('Build complete', { exact: true }).click()
  const palette = page.getByPlaceholder('Type a command...')
  await page.keyboard.down('Alt')
  await page.keyboard.down('Shift')
  await page.keyboard.down('d')
  await expect(palette).toBeFocused()
  await page.keyboard.down('d')
  await expect(palette).toBeFocused()
  await page.keyboard.up('d')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Alt')
  await page.keyboard.press('Alt+Shift+d')
  await expect(dock).toBeHidden()
})

for (const releaseIn of ['Messages', 'other iframe'] as const) {
  test(`accepts a new press after the opening key is released in ${releaseIn}`, async ({ page, viewer }) => {
    await page.goto(viewer.origin)
    await page.locator('#devframes-dock').hover()
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    const panel = page.frameLocator('iframe[title="Messages"]')
    await panel.getByText('Build complete', { exact: true }).click()
    const palette = page.getByPlaceholder('Type a command...')
    await page.keyboard.down('ControlOrMeta')
    await page.keyboard.down('k')
    await expect(palette).toBeFocused()
    await page.keyboard.up('ControlOrMeta')
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    const field = releaseIn === 'Messages'
      ? panel.getByRole('searchbox')
      : page.frameLocator('iframe[title="Other panel"]').getByRole('textbox')
    await field.focus()
    await page.keyboard.up('k')

    await page.keyboard.down('k')
    const input = page.getByRole('textbox', { name: 'Host input' })
    await input.focus()
    await page.keyboard.down('k')
    await page.keyboard.up('k')
    await expect(input).toHaveValue('k')
  })
}
