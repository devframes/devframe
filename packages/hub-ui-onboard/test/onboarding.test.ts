import type { AddressInfo } from 'node:net'
import type { Onboarding, OnboardingStatus } from '../src/types'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createOnboarding } from '../src'

const FIXTURE = fileURLToPath(new URL('./fixtures/pkg', import.meta.url))

// The install test spawns a real npm; keep it offline and quiet.
process.env.npm_config_audit = 'false'
process.env.npm_config_fund = 'false'
process.env.npm_config_update_notifier = 'false'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onboard-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'host', private: true }))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

async function serve(onboarding: Onboarding): Promise<string> {
  const server = createServer((req, res) => {
    onboarding.nodeMiddleware(req, res, () => {
      res.statusCode = 404
      res.end('outside')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => server.close())
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function status(origin: string): Promise<OnboardingStatus> {
  const response = await fetch(`${origin}/__devframes/__onboard/status`)
  return response.json()
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (;;) {
    const current = await read()
    if (done(current))
      return current
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

const settled = (s: OnboardingStatus) => s.state !== 'installing' && s.state !== 'idle'

describe('createOnboarding', () => {
  it('refuses an empty package list', () => {
    expect(() => createOnboarding({ packages: [] })).toThrow(expect.objectContaining({ code: 'DF9000' }))
  })

  it('serves the button and reports an idle status with derived strings', async () => {
    const cwd = tempProject()
    const onboarding = createOnboarding({ cwd, packages: ['@nuxt/devtools'], branding: { productName: 'Nuxt DevTools' } })
    const origin = await serve(onboarding)

    expect(onboarding.scriptSrc).toBe('/__devframes/embedded.js')
    expect(onboarding.disabled).toBe(false)

    const script = await fetch(`${origin}/__devframes/embedded.js`)
    expect(script.headers.get('content-type')).toContain('text/javascript')
    expect(await script.text()).toContain('devframes-onboard')

    const current = await status(origin)
    expect(current.state).toBe('idle')
    expect(current.command).toBe('npm i -D @nuxt/devtools')
    expect(current.messages.install).toBe('Install Nuxt DevTools')
    expect(current.messages.disable).toBe('Disable entirely')
    expect(current.branding.productName).toBe('Nuxt DevTools')

    expect((await fetch(`${origin}/__devframes/nope`)).status).toBe(404)
    expect(await (await fetch(`${origin}/elsewhere`)).text()).toBe('outside')
  })

  it('honors a custom base and message overrides', async () => {
    const onboarding = createOnboarding({ cwd: tempProject(), base: 'tools', packages: ['x'], messages: { install: 'Go' } })
    const origin = await serve(onboarding)
    expect(onboarding.scriptSrc).toBe('/tools/embedded.js')
    const response = await fetch(`${origin}/tools/__onboard/status`)
    expect(((await response.json()) as OnboardingStatus).messages.install).toBe('Go')
  })

  it('rejects a cross-origin install or disable', async () => {
    const origin = await serve(createOnboarding({ cwd: tempProject(), packages: ['x'] }))
    for (const action of ['install', 'disable']) {
      const response = await fetch(`${origin}/__devframes/__onboard/${action}`, {
        method: 'POST',
        headers: { origin: 'http://evil.localhost:1' },
      })
      expect(response.status).toBe(403)
    }
    expect((await status(origin)).state).toBe('idle')
  })

  it('persists disable on disk for the next process', async () => {
    const cwd = tempProject()
    const origin = await serve(createOnboarding({ cwd, packages: ['x'] }))
    const response = await fetch(`${origin}/__devframes/__onboard/disable`, { method: 'POST', headers: { origin } })
    expect(response.status).toBe(204)
    expect((await status(origin)).state).toBe('disabled')

    const file = join(cwd, 'node_modules/.devframe/hub-ui-onboard.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ disabled: true })
    expect(createOnboarding({ cwd, packages: ['x'] }).disabled).toBe(true)
  })

  it('installs with the real package manager and hands the base to onInstalled', async () => {
    const cwd = tempProject()
    const onboarding = createOnboarding({
      cwd,
      packages: [`file:${FIXTURE}`],
      onInstalled: () => () => new Response('hub here'),
    })
    const origin = await serve(onboarding)

    const accepted = await fetch(`${origin}/__devframes/__onboard/install`, { method: 'POST', headers: { origin } })
    expect(accepted.status).toBe(202)

    const script = () => fetch(`${origin}/__devframes/embedded.js`).then(r => r.text())
    expect(await waitFor(script, body => body === 'hub here')).toBe('hub here')
    expect(existsSync(join(cwd, 'node_modules/onboard-fixture/package.json'))).toBe(true)
    expect(await (await fetch(`${origin}/__devframes/__onboard/status`)).text()).toBe('hub here')
  })

  it('hands the base over at once when the packages are already installed', async () => {
    const cwd = tempProject()
    mkdirSync(join(cwd, 'node_modules/onboard-fixture'), { recursive: true })
    const onboarding = createOnboarding({
      cwd,
      packages: ['onboard-fixture', 'file:/never/installed'],
      onInstalled: () => () => new Response('hub here'),
    })
    expect(onboarding.installed).toBe(true)
    const origin = await serve(onboarding)
    expect(await (await fetch(`${origin}/__devframes/embedded.js`)).text()).toBe('hub here')
  })

  it('reports installed, and serves no button, when the packages exist but the host offers no hub', async () => {
    const cwd = tempProject()
    mkdirSync(join(cwd, 'node_modules/onboard-fixture'), { recursive: true })
    const onboarding = createOnboarding({ cwd, packages: ['onboard-fixture'] })
    const origin = await serve(onboarding)
    expect(onboarding.installed).toBe(true)
    expect((await status(origin)).state).toBe('installed')
  })

  it('reports a failed install as an error the client can retry', async () => {
    const cwd = tempProject()
    const origin = await serve(createOnboarding({ cwd, packages: ['file:/nonexistent/onboard-missing'] }))
    await fetch(`${origin}/__devframes/__onboard/install`, { method: 'POST', headers: { origin } })
    const final = await waitFor(() => status(origin), s => s.state === 'error')
    expect(final.error?.code).toBe('DF9001')
    expect(final.error?.message).toContain('npm i -D file:/nonexistent/onboard-missing')
  })

  it('asks for a restart when onInstalled returns nothing', async () => {
    const cwd = tempProject()
    const origin = await serve(createOnboarding({ cwd, packages: [`file:${FIXTURE}`], dev: false }))
    await fetch(`${origin}/__devframes/__onboard/install`, { method: 'POST', headers: { origin } })
    const final = await waitFor(() => status(origin), settled)
    expect(final.state).toBe('installed')
    expect(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).dependencies).toHaveProperty('onboard-fixture')
  })
})
