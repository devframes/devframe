import type { CodeServerSharedState } from '../src/types'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PLUGIN_ID, STATE_KEY, TERMINAL_SESSION_ICON, TERMINAL_SESSION_TITLE } from '../src/constants'
import { setupCodeServer } from '../src/node/index'
import {
  createFakeHubTerminals,
  createTestContext,
  writeFakeCodeServer,
  writeFakeServeWeb,
  writeFakeTunnel,
} from './_utils'

async function sharedState(ctx: Awaited<ReturnType<typeof createTestContext>>): Promise<CodeServerSharedState> {
  const state = await ctx.rpc.sharedState.get(STATE_KEY)
  return state.value() as CodeServerSharedState
}

/** Poll until `predicate` holds or the deadline elapses. */
async function waitUntil(predicate: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate())
      return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for condition')
}

describe('@devframes/plugin-code-server', () => {
  const supervisors: { dispose: () => void }[] = []

  afterEach(() => {
    for (const s of supervisors.splice(0))
      s.dispose()
  })

  it('detects a missing binary and refuses to start', async () => {
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin: '/no/such/code-server-xyz' })
    supervisors.push(supervisor)

    expect(supervisor.status().detection).toMatchObject({ checked: true, installed: false })
    expect((await sharedState(ctx)).detection.installed).toBe(false)

    await expect(supervisor.start()).rejects.toThrow(/binary|not installed/i)
  })

  it('detects an installed binary and reports its version + backend', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0 fakehash with Code 1.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    const detection = supervisor.status().detection
    expect(detection.installed).toBe(true)
    expect(detection.version).toBe('4.99.0')
    expect(detection.backend).toBe('code-server')
    expect(detection.mode).toBe('local')
  })

  it('launches code-server, becomes ready, and hands off a valid session cookie', async () => {
    const dumpEnvTo = join(mkdtempSync(join(tmpdir(), 'dcs-dump-')), 'hashed')
    const bin = writeFakeCodeServer({ version: '4.99.0', dumpEnvTo })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    const result = await supervisor.start()
    expect(result.server.status).toBe('running')
    expect(result.server.port).toBeGreaterThan(0)
    expect(result.connect?.cookie?.name).toBe('code-server-session')
    expect(result.connect?.cookie?.value).toMatch(/^[a-f0-9]{64}$/)
    expect(result.connect?.path).toBe('/')

    // The cookie value handed to the client must equal HASHED_PASSWORD the
    // server was launched with — that is what makes the iframe auto-auth.
    const hashed = readFileSync(dumpEnvTo, 'utf8')
    expect(hashed).toBe(result.connect?.cookie?.value)

    expect((await sharedState(ctx)).server.status).toBe('running')
    // Shared state must never leak the connect material.
    expect((await sharedState(ctx)) as any).not.toHaveProperty('connect')
  })

  it('stops a running server and resets to stopped', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    await supervisor.start()
    const stopped = supervisor.stop()
    expect(stopped.server.status).toBe('stopped')
    expect(stopped.connect).toBeUndefined()
    expect((await sharedState(ctx)).server.status).toBe('stopped')
  })

  it('is idempotent while running', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    const first = await supervisor.start()
    const second = await supervisor.start()
    expect(second.server.port).toBe(first.server.port)
  })

  it('allocates a dynamic port when serverPort is 0', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin, serverPort: 0 })
    supervisors.push(supervisor)

    const result = await supervisor.start()
    expect(result.server.status).toBe('running')
    expect(result.server.port).toBeGreaterThan(0)
    expect(result.server.port).not.toBe(8080)
  })

  it('starts on boot when startOnBoot is set', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin, serverPort: 0, startOnBoot: true })
    supervisors.push(supervisor)

    await waitUntil(() => supervisor.status().server.status === 'running')
    expect(supervisor.status().server.port).toBeGreaterThan(0)
  })

  describe('code serve-web backend', () => {
    it('launches `code serve-web` and hands off a connection token via query', async () => {
      const dumpTokenTo = join(mkdtempSync(join(tmpdir(), 'dcs-tkn-')), 'token')
      const bin = writeFakeServeWeb({ version: '1.99.0', dumpTokenTo })
      const ctx = await createTestContext()
      const supervisor = await setupCodeServer(ctx, { backend: 'code-serve-web', bin, serverPort: 0 })
      supervisors.push(supervisor)

      const result = await supervisor.start()
      expect(result.server.status).toBe('running')
      expect(result.detection.backend).toBe('code-serve-web')
      // No cookie for serve-web; the token rides on the URL query.
      expect(result.connect?.cookie).toBeUndefined()
      const token = readFileSync(dumpTokenTo, 'utf8')
      expect(token).toMatch(/^[a-f0-9]{64}$/)
      expect(result.connect?.path).toContain(`tkn=${token}`)
      expect(result.connect?.path).toContain('folder=')
    })
  })

  describe('reuseExistingServer', () => {
    it('adopts an already-running server on the target port without spawning', async () => {
      const bin = writeFakeCodeServer({ version: '4.99.0' })
      const ctx = await createTestContext()
      const running = await setupCodeServer(ctx, { bin, serverPort: 0 })
      supervisors.push(running)
      const first = await running.start()
      const port = first.server.port!

      const ctx2 = await createTestContext()
      const adopter = await setupCodeServer(ctx2, { bin, serverPort: port, reuseExistingServer: true })
      supervisors.push(adopter)

      const result = await adopter.start()
      expect(result.server.status).toBe('running')
      expect(result.server.port).toBe(port)
      expect(result.server.pid).toBeUndefined()
      // We don't own the adopted server's secret, so no auth handoff.
      expect(result.connect?.cookie).toBeUndefined()
      expect(result.connect?.path).toBe('/')
    })
  })

  describe('tunnel mode', () => {
    it('surfaces the device-login prompt while authenticating', async () => {
      const bin = writeFakeTunnel({ version: '1.99.0', printLogin: true })
      const ctx = await createTestContext()
      const supervisor = await setupCodeServer(ctx, { mode: 'tunnel', bin })
      supervisors.push(supervisor)

      const result = await supervisor.start()
      expect(result.detection.mode).toBe('tunnel')
      expect(result.server.status).toBe('starting')
      expect(result.server.login).toEqual({ url: 'https://github.com/login/device', code: 'ABCD-1234' })
    })

    it('becomes running and embeds the vscode.dev URL when the tunnel opens', async () => {
      const url = 'https://vscode.dev/tunnel/testmachine/work'
      const bin = writeFakeTunnel({ version: '1.99.0', printUrl: true, url })
      const ctx = await createTestContext()
      const supervisor = await setupCodeServer(ctx, { mode: 'tunnel', bin })
      supervisors.push(supervisor)

      const result = await supervisor.start()
      expect(result.server.status).toBe('running')
      expect(result.connect?.url).toBe(url)
    })
  })

  describe('hub terminals integration', () => {
    it('spawns code-server through ctx.terminals as a read-only session', async () => {
      const dumpEnvTo = join(mkdtempSync(join(tmpdir(), 'dcs-dump-')), 'hashed')
      const bin = writeFakeCodeServer({ version: '4.99.0', dumpEnvTo })
      const ctx = await createTestContext()
      const terminals = createFakeHubTerminals()
      ;(ctx as unknown as { terminals: typeof terminals }).terminals = terminals
      const supervisor = await setupCodeServer(ctx, { bin })
      supervisors.push(supervisor)

      const result = await supervisor.start()
      expect(result.server.status).toBe('running')

      // Launched through the hub, surfaced as exactly one session.
      expect(terminals.sessions.size).toBe(1)
      const session = terminals.sessions.get(PLUGIN_ID)
      expect(session).toBeDefined()
      // Proper name + icon, and the workspace folder as description.
      expect(session!.title).toBe(TERMINAL_SESSION_TITLE)
      expect(session!.icon).toBe(TERMINAL_SESSION_ICON)
      expect(session!.status).toBe('running')
      expect(session!.type).toBe('child-process')
      expect(session!.description).toBe(ctx.cwd)
      // The hub-owned child is the one the supervisor reports as running.
      expect(session!.getChildProcess()?.pid).toBe(result.server.pid)

      // Auth still flows end to end through the hub: HASHED_PASSWORD the process
      // was launched with equals the cookie handed to the client.
      const hashed = readFileSync(dumpEnvTo, 'utf8')
      expect(hashed).toBe(result.connect?.cookie?.value)
    })

    it('reflects stop on the hub session and re-registers on the next start', async () => {
      const bin = writeFakeCodeServer({ version: '4.99.0' })
      const ctx = await createTestContext()
      const terminals = createFakeHubTerminals()
      ;(ctx as unknown as { terminals: typeof terminals }).terminals = terminals
      const supervisor = await setupCodeServer(ctx, { bin })
      supervisors.push(supervisor)

      await supervisor.start()
      const first = terminals.sessions.get(PLUGIN_ID)

      supervisor.stop()
      // The session stays visible, marked stopped.
      expect(terminals.sessions.get(PLUGIN_ID)?.status).toBe('stopped')

      // A fresh start replaces the stale session under the same stable id.
      await supervisor.start()
      expect(terminals.sessions.size).toBe(1)
      const second = terminals.sessions.get(PLUGIN_ID)
      expect(second).not.toBe(first)
      expect(second?.status).toBe('running')
    })
  })
})
