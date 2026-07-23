import type { DevframeHost, DevframeNodeContext } from 'devframe/types'
import type { DevframeJsonRenderSpec } from '../src/types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext } from 'devframe/node'
import { beforeEach, describe, expect, it } from 'vitest'
import { createJsonRenderView } from '../src/node/index'
import { JSON_RENDER_INDEX_KEY } from '../src/view-index'

function createHost(): DevframeHost {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-jr-'))
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost:5173',
    getStorageDir: () => storageDir,
  } as unknown as DevframeHost
}

async function createContext(): Promise<DevframeNodeContext> {
  return createHostContext({ cwd: process.cwd(), mode: 'dev', host: createHost() })
}

const spec: DevframeJsonRenderSpec = {
  root: 'a',
  elements: {
    a: { type: 'Text', props: { text: 'hi' }, children: [] },
  },
  state: { count: 1 },
}

let ctx: DevframeNodeContext
beforeEach(async () => {
  ctx = await createContext()
})

describe('createJsonRenderView identity', () => {
  it('uses a scoped, stable state key and serializable ref', () => {
    const view = createJsonRenderView(ctx, { id: 'metrics', spec })
    expect(view.ref).toEqual({
      stateKey: 'devframe:json-render:global:metrics',
    })
    expect(JSON.parse(JSON.stringify(view.ref))).toEqual(view.ref)
  })

  it('derives the scope from a scoped context namespace', () => {
    const scoped = ctx.scope('my-plugin')
    const view = createJsonRenderView(scoped, { id: 'metrics', spec })
    expect(view.ref.stateKey).toBe('devframe:json-render:my-plugin:metrics')
  })

  it('throws DF0039 on a duplicate id within a scope', () => {
    createJsonRenderView(ctx, { id: 'dup', spec })
    expect(() => createJsonRenderView(ctx, { id: 'dup', spec })).toThrow(expect.objectContaining({ code: 'DF0039' }))
  })
})

describe('createJsonRenderView state', () => {
  it('registers a shared state carrying the spec', async () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec })
    expect(ctx.rpc.sharedState.keys()).toContain(view.ref.stateKey)
    const state = await ctx.rpc.sharedState.get(view.ref.stateKey)
    expect((state.value() as DevframeJsonRenderSpec).root).toBe('a')
  })

  it('normalizes a missing state to an empty object', () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec: { root: 'a', elements: {} } })
    expect(view.value().state).toEqual({})
  })

  it('replaces the whole spec on update', () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec })
    view.update({ root: 'b', elements: { b: { type: 'Badge', props: { text: 'x' }, children: [] } } })
    expect(view.value().root).toBe('b')
  })

  it('applies JSON-Pointer patches into /state', () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec })
    view.patchState([{ op: 'replace', path: '/count', value: 3 }])
    expect((view.value().state as { count: number }).count).toBe(3)
  })
})

describe('createJsonRenderView validation', () => {
  it('throws DF0038 on invalid element props at ingress', () => {
    expect(() => createJsonRenderView(ctx, {
      id: 'bad',
      spec: { root: 'a', elements: { a: { type: 'Button', props: { variant: 'nope' }, children: [] } } },
    })).toThrow(expect.objectContaining({ code: 'DF0038' }))
  })

  it('throws DF0041 on a non-JSON-serializable spec', () => {
    const circular: any = { root: 'a', elements: {} }
    circular.self = circular
    expect(() => createJsonRenderView(ctx, { id: 'circular', spec: circular })).toThrow(expect.objectContaining({ code: 'DF0041' }))
  })
})

describe('createJsonRenderView index', () => {
  it('publishes an index entry (title defaults to id) and removes it on dispose', async () => {
    const view = createJsonRenderView(ctx, { id: 'metrics', spec })
    const index = await ctx.rpc.sharedState.get(JSON_RENDER_INDEX_KEY)
    expect((index.value() as Record<string, unknown>)[view.ref.stateKey]).toEqual({
      id: 'metrics',
      scope: 'global',
      stateKey: view.ref.stateKey,
      title: 'metrics',
    })

    view.dispose()
    expect((index.value() as Record<string, unknown>)[view.ref.stateKey]).toBeUndefined()
  })

  it('carries an explicit title', async () => {
    const view = createJsonRenderView(ctx, { id: 'm', title: 'Metrics', spec })
    const index = await ctx.rpc.sharedState.get(JSON_RENDER_INDEX_KEY)
    expect((index.value() as Record<string, { title: string }>)[view.ref.stateKey].title).toBe('Metrics')
    expect(view.title).toBe('Metrics')
  })
})

describe('createJsonRenderView disposal', () => {
  it('unregisters the shared state and frees the id', () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec })
    expect(ctx.rpc.sharedState.keys()).toContain(view.ref.stateKey)
    view.dispose()
    expect(ctx.rpc.sharedState.keys()).not.toContain(view.ref.stateKey)
    // id is free again after disposal
    expect(() => createJsonRenderView(ctx, { id: 'v', spec })).not.toThrow()
  })

  it('throws DF0040 when used after disposal', () => {
    const view = createJsonRenderView(ctx, { id: 'v', spec })
    view.dispose()
    expect(() => view.update(spec)).toThrow(expect.objectContaining({ code: 'DF0040' }))
  })
})
