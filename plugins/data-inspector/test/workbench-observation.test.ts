import type { QueryOutcome } from '../src/node/engine/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useWorkbench } from '../app/composables/workbench'

const query = vi.hoisted(() => vi.fn())
vi.mock('../app/composables/rpc', () => ({
  connection: { mode: 'rpc' },
  backend: () => ({
    query,
    skeleton: async () => ({
      ok: true,
      skeleton: {},
      nodes: 0,
      ms: 0,
    }),
    sources: async () => [
      {
        id: 'a',
        title: 'Source A',
        static: false,
        writable: false,
      },
      {
        id: 'b',
        title: 'Source B',
        static: false,
        writable: false,
      },
    ],
  }),
}))

function success(result: unknown): QueryOutcome {
  return {
    ok: true,
    result,
    stats: {
      queryMs: 1,
      payloadBytes: 2,
      normalize: {
        nodes: 1,
        refs: 0,
        truncatedDepth: 0,
        truncatedEntries: 0,
        truncatedProps: 0,
        ms: 1,
      },
    },
  }
}

let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '' })
  vi.stubGlobal('history', {
    replaceState: vi.fn(),
  })
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: vi.fn(),
  })
  query.mockReset().mockResolvedValue(success([]))
  scope = effectScope()
})
afterEach(() => {
  scope.stop()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function setup() {
  const wb = scope.run(() => useWorkbench())!
  await wb.loadSources()
  await nextTick()
  return wb
}

describe('successful query observation', () => {
  it('keeps the executed conditions when the editor and filters change', async () => {
    const wb = await setup()
    expect(wb.hasResult.value).toBe(true)
    wb.query.value = 'items'
    expect(wb.observation.value?.query).toBe('$')
    expect(wb.observationNotices.value.join(' ')).toContain('conditions changed')
    let finish!: (value: QueryOutcome) => void
    query.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    const run = wb.runNow()
    expect(wb.observationNotices.value.join(' ')).toContain('pending')
    wb.query.value = 'different'
    finish(success({ original: true }))
    await run
    expect(wb.observation.value?.query).toBe('items')
    expect(wb.observation.value?.result).toEqual({ original: true })
    expect(wb.observation.value?.source).toEqual({ id: 'a', title: 'Source A' })
    expect(wb.observation.value?.filters.excludeFunctions).toBe(false)
    expect(wb.observationNotices.value.join(' ')).toContain('conditions changed')
  })

  it('keeps the earlier success through syntax, server and transport failures', async () => {
    const wb = await setup()
    wb.query.value = '['
    await wb.runNow()
    expect(wb.hasResult.value).toBe(true)
    expect(wb.observationNotices.value.join(' ')).toContain('syntax')
    wb.query.value = '$'
    query.mockResolvedValueOnce({
      ok: false,
      error: { name: 'QueryError', message: 'failed' },
    })
    await wb.runNow()
    expect(wb.observation.value?.result).toEqual([])
    expect(wb.observationNotices.value.join(' ')).toContain('latest query failed')
    query.mockRejectedValueOnce(new Error('disconnected'))
    await wb.runNow()
    expect(wb.observation.value?.result).toEqual([])
    expect(wb.serverError.value).toContain('disconnected')
  })

  it('clears immediately on source changes and drops late old-source responses', async () => {
    const wb = await setup()
    let finish!: (value: QueryOutcome) => void
    query.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    const oldRun = wb.runNow()
    query.mockResolvedValueOnce({
      ok: false,
      error: { name: 'Unavailable', message: 'new source failed' },
    })
    wb.sourceId.value = 'b'
    expect(wb.hasResult.value).toBe(false)
    expect(wb.observation.value).toBeNull()
    finish(success('old source'))
    await oldRun
    await nextTick()
    expect(wb.hasResult.value).toBe(false)
    expect(wb.observation.value).toBeNull()
    wb.sourceId.value = ''
    expect(wb.running.value).toBe(false)
  })

  it.each([[], {}, null, false, 0, ''])('retains a successful empty value: %j', async (value) => {
    query.mockResolvedValueOnce(success(value))
    const wb = await setup()
    expect(wb.hasResult.value).toBe(true)
    expect(wb.observation.value?.result).toEqual(value)
    expect(wb.result.value).toEqual(value)
  })

  it('has no observation before the first success or after an initial failure', async () => {
    let finish!: (value: QueryOutcome) => void
    query.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    const wb = await setup()
    expect(wb.hasResult.value).toBe(false)
    expect(wb.observation.value).toBeNull()
    finish({
      ok: false,
      error: { name: 'Unavailable', message: 'failed' },
    })
    await nextTick()
    expect(wb.hasResult.value).toBe(false)
    expect(wb.observation.value).toBeNull()
  })

  it('binds filter changes to the newer request and drops an older response', async () => {
    const wb = await setup()
    let finishOld!: (value: QueryOutcome) => void
    let finishNew!: (value: QueryOutcome) => void
    query.mockImplementationOnce(() => new Promise(resolve => (finishOld = resolve)))
    const oldRun = wb.runNow()
    query.mockImplementationOnce(() => new Promise(resolve => (finishNew = resolve)))
    wb.settings.excludeFunctions = true
    wb.settings.excludeUnderscoreProps = true
    wb.settings.excludeDollarProps = true
    expect(wb.observation.value?.filters).toEqual({ excludeFunctions: false, excludeUnderscoreProps: false, excludeDollarProps: false })
    expect(wb.observationNotices.value.join(' ')).toContain('conditions changed')
    await nextTick()
    expect(query).toHaveBeenLastCalledWith('a', '$', { excludeFunctions: true, excludeUnderscoreProps: true, excludeDollarProps: true })
    finishOld(success('older filters'))
    await oldRun
    expect(wb.running.value).toBe(true)
    expect(wb.observation.value?.result).toEqual([])
    finishNew(success('newer filters'))
    await nextTick()
    expect(wb.running.value).toBe(false)
    expect(wb.observation.value?.result).toBe('newer filters')
    expect(wb.observation.value?.filters).toEqual({ excludeFunctions: true, excludeUnderscoreProps: true, excludeDollarProps: true })
    expect(wb.observationNotices.value).toEqual([])
  })

  it.each(['success', 'failure', 'rejection'])('ignores a late older %s after the newer response', async (kind) => {
    const wb = await setup()
    let finish!: (value: QueryOutcome) => void
    let reject!: (reason: Error) => void
    query.mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = resolve
      reject = fail
    }))
    const oldRun = wb.runNow()
    wb.query.value = 'items'
    query.mockResolvedValueOnce(success('newest'))
    await wb.runNow()
    const latest = wb.observation.value
    if (kind === 'rejection') {
      reject(new Error('old transport failure'))
    }
    else if (kind === 'failure') {
      finish({
        ok: false,
        error: { name: 'OldError', message: 'old failure' },
      })
    }
    else {
      finish(success('old success'))
    }
    await oldRun
    expect(wb.observation.value).toBe(latest)
    expect(wb.observation.value?.query).toBe('items')
    expect(wb.result.value).toBe('newest')
    expect(wb.serverError.value).toBeNull()
    expect(wb.running.value).toBe(false)
  })

  it('clears the old observation when the next source restores an invalid draft', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ b: '[' }),
      setItem: vi.fn(),
    })
    const wb = await setup()
    let finish!: (value: QueryOutcome) => void
    query.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    const oldRun = wb.runNow()
    wb.sourceId.value = 'b'
    await nextTick()
    expect(wb.query.value).toBe('[')
    expect(wb.syntax.value.kind).not.toBe('ok')
    expect(wb.hasResult.value).toBe(false)
    expect(wb.running.value).toBe(false)
    expect(wb.lastRunAt.value).toBeNull()
    expect(wb.stats.value).toBeNull()
    expect(query).toHaveBeenCalledTimes(2)
    finish(success('old source'))
    await oldRun
    expect(wb.observation.value).toBeNull()
    expect(wb.result.value).toBeUndefined()
    expect(wb.hasResult.value).toBe(false)
  })

  it('keeps the receipt time and observation when only time passes', async () => {
    vi.setSystemTime(new Date('2026-11-05T01:00:00Z'))
    const wb = await setup()
    const saved = wb.observation.value
    expect(saved?.receivedAt).toBe(Date.now())
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(wb.observation.value).toBe(saved)
    expect(wb.lastRunAt.value).toBe(saved?.receivedAt)
    expect(wb.hasResult.value).toBe(true)
    expect(wb.observationNotices.value).toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it.each(['', '&source=a'])('preserves a shared query with source selection %s', async (source) => {
    vi.stubGlobal('location', { hash: `#query=items&excludeFunctions=1${source}`, pathname: '/', search: '' })
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ a: 'oldDraft' }),
      setItem: vi.fn(),
    })
    const wb = await setup()
    expect(wb.query.value).toBe('items')
    await wb.runNow()
    expect(query).toHaveBeenLastCalledWith('a', 'items', { excludeFunctions: true, excludeUnderscoreProps: false, excludeDollarProps: false })
    expect(wb.observation.value?.query).toBe('items')
  })
})
