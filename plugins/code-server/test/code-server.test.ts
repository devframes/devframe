import type { CodeServerSharedState } from '../src/types'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { STATE_KEY } from '../src/constants'
import { setupCodeServer } from '../src/node/index'
import { createTestContext, writeFakeCodeServer } from './_utils'

async function sharedState(ctx: Awaited<ReturnType<typeof createTestContext>>): Promise<CodeServerSharedState> {
  const state = await ctx.rpc.sharedState.get(STATE_KEY)
  return state.value() as CodeServerSharedState
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

    await expect(supervisor.start()).rejects.toThrow(/not installed/i)
  })

  it('detects an installed binary and reports its version', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0 fakehash with Code 1.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    const detection = supervisor.status().detection
    expect(detection.installed).toBe(true)
    expect(detection.version).toBe('4.99.0')
  })

  it('launches code-server, becomes ready, and hands off a valid auth cookie', async () => {
    const dumpEnvTo = join(mkdtempSync(join(tmpdir(), 'dcs-dump-')), 'hashed')
    const bin = writeFakeCodeServer({ version: '4.99.0', dumpEnvTo })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    const result = await supervisor.start()
    expect(result.server.status).toBe('running')
    expect(result.server.port).toBeGreaterThan(0)
    expect(result.auth?.cookieName).toBe('code-server-session')
    expect(result.auth?.cookieValue).toMatch(/^[a-f0-9]{64}$/)

    // The cookie value handed to the client must equal HASHED_PASSWORD the
    // server was launched with — that is what makes the iframe auto-auth.
    const hashed = readFileSync(dumpEnvTo, 'utf8')
    expect(hashed).toBe(result.auth?.cookieValue)

    expect((await sharedState(ctx)).server.status).toBe('running')
    // Shared state must never leak the auth material.
    expect((await sharedState(ctx)) as any).not.toHaveProperty('auth')
  })

  it('stops a running server and resets to stopped', async () => {
    const bin = writeFakeCodeServer({ version: '4.99.0' })
    const ctx = await createTestContext()
    const supervisor = await setupCodeServer(ctx, { bin })
    supervisors.push(supervisor)

    await supervisor.start()
    const stopped = supervisor.stop()
    expect(stopped.server.status).toBe('stopped')
    expect(stopped.auth).toBeUndefined()
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
})
