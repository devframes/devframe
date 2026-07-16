/**
 * PROTOTYPE — throwaway code.
 *
 * Kitchen-sink demo graph: every shape the normalizer must survive.
 */

class SessionStore {
  name = 'sessions'
  createdAt = new Date('2026-01-15T10:00:00Z')
  private secret = 'own-private-field-visible' // own field (TS `private` is compile-time only)
  entries = new Map<string, { user: string, hits: number }>([
    ['a1', { user: 'ada', hits: 3 }],
    ['b2', { user: 'brendan', hits: 7 }],
  ])

  get upperName(): string {
    return this.name.toUpperCase() // own-prototype getter: invisible to jora, fine
  }

  touch(): string {
    return `${this.secret}:touched`
  }
}

export interface DemoGraph {
  [key: string]: unknown
}

export function createDemoGraph(): DemoGraph {
  const store = new SessionStore()

  const circularParent: Record<string, unknown> = { name: 'parent' }
  const circularChild: Record<string, unknown> = { name: 'child', parent: circularParent }
  circularParent.child = circularChild

  const graph: DemoGraph = {
    title: 'kitchen sink',
    counts: [1, 2, 3, 42],
    bigArray: Array.from({ length: 500 }, (_, i) => ({ i, sq: i * i })),
    store,
    tags: new Set(['alpha', 'beta', 'gamma']),
    lookup: new Map<unknown, unknown>([
      ['string-key', 1],
      [{ objKey: true }, 2],
    ]),
    circular: circularParent,
    when: new Date('2026-07-16T00:00:00Z'),
    pattern: /^devframe-.+$/i,
    big: 12345678901234567890n,
    sym: Symbol('demo'),
    err: new TypeError('demo failure'),
    pending: Promise.resolve('never seen'),
    danger: {
      // A function reachable in the graph — jora CAN invoke this. The spike
      // demonstrates the hazard on this harmless canary instead of server.close.
      selfDestruct: () => {
        (graph as { destructed?: boolean }).destructed = true
        return 'BOOM'
      },
    },
    deep: { l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { leaf: 'bottom' } } } } } } } } } },
  }
  return graph
}
