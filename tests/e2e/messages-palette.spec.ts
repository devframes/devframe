import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createUi } from '@devframes/hub-ui'
import { initHub } from '@devframes/hub/initiate'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { expect, test } from '@playwright/test'

test('opens the palette once from Messages when another command shares its shortcut', async ({ page }, testInfo) => {
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
  const server = createServer(hub.nodeMiddleware)
  const detach = hub.attach(server)
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address() as AddressInfo
    await page.goto(`http://127.0.0.1:${port}${hub.base}`)
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
    expect(calls).toBe(1)
  }
  finally {
    await page.close()
    detach()
    await hub.close()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  }
})
