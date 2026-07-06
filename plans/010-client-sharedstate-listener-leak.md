# Plan 010: Stop client shared-state from re-initializing (and double-writing) on every trust flip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/client/rpc-shared-state.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (must not break first-init or genuine resubscribe)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

When a client is untrusted, `get(key)` resolves immediately and registers a
`rpc.events.on('rpc:is-trusted:updated', …)` listener that calls
`initSharedState()` on **every** `true`. Trust flips to `true` more than once in
practice (initial `requestTrust`, cross-tab auth channel, code exchange), and
`initSharedState()` re-runs `registerSharedState(key, state)` each time — which
adds another `state.on('updated', …)` bridge. So after N trust re-emits, one
local mutation fires N duplicate `server-state:set`/`patch` calls to the server,
and the per-`get` trust listeners never unsubscribe.

## Current state

`packages/devframe/src/client/rpc-shared-state.ts:43-61` — `registerSharedState`
adds an `updated` bridge that emits `server-state:set`/`patch`:

```ts
function registerSharedState<T extends object>(key: string, state: SharedState<T>) {
  const offs: (() => void)[] = []
  offs.push(state.on('updated', (fullState, patches, syncId) => {
    if (isStaticBackend) return
    if (patches) rpc.callEvent('devframe:rpc:server-state:patch', key, patches, syncId)
    else rpc.callEvent('devframe:rpc:server-state:set', key, fullState, syncId)
  }))
  return () => { for (const off of offs) off() }
}
```

`get` (`:71-127`), untrusted branch:

```ts
return new Promise<SharedState<T>>((resolve) => {
  if (!rpc.isTrusted) {
    resolve(state)
    rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
      if (isTrusted) {
        initSharedState()          // ← re-runs on every trust flip → duplicate bridges
      }
    })
  }
  else {
    initSharedState().then(resolve)
  }
})
```

`get` early-returns a cached state for a known key (`:75-77`), so the only
re-entry into `initSharedState` for a key is via this trust listener.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/client/rpc-shared-state.test.ts` | all pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/client/rpc-shared-state.ts`
- `packages/devframe/src/client/rpc-shared-state.test.ts` (create)

**Out of scope**: the server host (`node/rpc-shared-state.ts`) and the trust/auth
flow. Keep the fix inside the client host.

## Git workflow

- Branch: `advisor/010-client-sharedstate-listener-leak`.
- Commit style: `fix(client): initialize shared state once per key across trust flips`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Guard init to run once per key

Make the trust-triggered init idempotent so the `updated` bridge is registered
exactly once per key:

```ts
return new Promise<SharedState<T>>((resolve) => {
  if (!rpc.isTrusted) {
    resolve(state)
    let initialized = false
    rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
      if (isTrusted && !initialized) {
        initialized = true
        initSharedState()
      }
    })
  }
  else {
    initSharedState().then(resolve)
  }
})
```

(Optional defense-in-depth: also track a `registeredBridges = new Set<string>()`
in the host closure and skip `registerSharedState(key, state)` if the key is
already present — so even a future second call can't double-register.)

### Step 2: Test

Create `packages/devframe/src/client/rpc-shared-state.test.ts` with a fake `rpc`:

```ts
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it } from 'vitest'
import { createRpcSharedStateClientHost } from './rpc-shared-state'

function makeFakeRpc() {
  const events = createEventEmitter<any>()
  const setCalls: any[][] = []
  const rpc = {
    connectionMeta: { backend: 'websocket' },
    isTrusted: false,
    events,
    client: { register: () => {} },
    callEvent: (name: string, ...args: any[]) => {
      if (name === 'devframe:rpc:server-state:set') setCalls.push(args)
    },
    call: async () => undefined,
  } as any
  return { rpc, events, setCalls }
}

describe('client shared state', () => {
  it('registers the server-sync bridge once across repeated trust flips', async () => {
    const { rpc, events, setCalls } = makeFakeRpc()
    const host = createRpcSharedStateClientHost(rpc)
    const state = await host.get('k', { initialValue: { a: 1 } })

    events.emit('rpc:is-trusted:updated', true)
    events.emit('rpc:is-trusted:updated', true) // second flip must not re-register

    state.mutate((d: any) => { d.a = 2 })
    expect(setCalls).toHaveLength(1) // exactly one server-state:set, not two
  })
})
```

Adjust member names to whatever `createRpcSharedStateClientHost` actually reads
(the essentials are `connectionMeta.backend`, `isTrusted`, `events`, `client.register`,
`callEvent`, `call`). If the real type needs more members to satisfy the compiler,
add `as any` stubs — the assertion (one emit, not two) is the point.

**Verify**: `pnpm exec vitest run packages/devframe/src/client/rpc-shared-state.test.ts`
→ passes; before the Step 1 fix it would record 2 calls.

## Test plan

- New test: two trust flips + one mutate → exactly one `server-state:set`.
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.
- Run any adjacent client tests to be safe: `pnpm exec vitest run packages/devframe/src/client`.

## Done criteria

- [ ] `initSharedState` runs at most once per key regardless of trust re-emits.
- [ ] The new test asserts exactly one `server-state:set` after two trust flips + one mutate, and passes.
- [ ] `pnpm exec vitest run packages/devframe/src/client` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A reconnect mechanism is discovered that *relies* on `initSharedState` re-running
  on trust flips to resubscribe (this WS transport has no reconnect today — see
  the finding for plan 011 — but if one exists, the fix must resubscribe without
  re-registering the bridge; report before changing).
- `createRpcSharedStateClientHost` can't be constructed with a minimal fake rpc
  (its dependencies are heavier than listed) — report what else it needs.

## Maintenance notes

- If reconnect is added later, separate "initialize once" (bridge + map) from
  "(re)subscribe" (send `server-state:subscribe` + refetch) so reconnect
  resubscribes without duplicating the bridge.
- Reviewer: confirm first init still happens exactly once and the `updated`
  bridge isn't registered twice.
