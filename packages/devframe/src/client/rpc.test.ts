import type { ConnectionMeta } from 'devframe/types'
import { describe, expect, it } from 'vitest'
import { readPublishedConnectionMeta } from './rpc'

describe('readPublishedConnectionMeta', () => {
  const meta: ConnectionMeta = { backend: 'websocket', websocket: { path: '__ws' } }

  it('reads the wrapped form, carrying the resolved base', () => {
    const result = readPublishedConnectionMeta({
      meta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
    })
    expect(result).toEqual({
      meta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
    })
  })

  it('accepts a wrapped form without a base', () => {
    expect(readPublishedConnectionMeta({ meta })).toEqual({ meta, metaBaseUrl: undefined })
  })

  it('treats a bare ConnectionMeta as legacy, inheriting without a base', () => {
    // Backward compatibility: older publishers (and hosts that set the shared
    // window key directly) store a raw ConnectionMeta rather than the wrapper.
    expect(readPublishedConnectionMeta(meta)).toEqual({ meta })
  })

  it('returns undefined for non-object values', () => {
    expect(readPublishedConnectionMeta(undefined)).toBeUndefined()
    expect(readPublishedConnectionMeta(null)).toBeUndefined()
    expect(readPublishedConnectionMeta('')).toBeUndefined()
  })
})
