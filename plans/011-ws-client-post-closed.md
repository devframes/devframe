# Plan 011: Don't leak a listener (or silently drop) when the WS client posts on a closing/closed socket

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/rpc/transports/ws-client.ts packages/devframe/src/rpc/transports/ws.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`createWsRpcChannel`'s `post()` sends immediately when the socket is `OPEN`;
otherwise it unconditionally registers an `'open'` listener to resend. If the
socket is `CLOSING`/`CLOSED` (not `CONNECTING`), `'open'` will never fire — the
message is lost and the listener is never removed. This transport has no
reconnect, so once a socket drops, every subsequent post silently leaks an
`open` listener and the caller gets no signal.

## Current state

`packages/devframe/src/rpc/transports/ws-client.ts:66-77`:

```ts
post: (data: string) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data)
  }
  else {
    function handler() {
      ws.send(data)
      ws.removeEventListener('open', handler)
    }
    ws.addEventListener('open', handler)   // ← never fires when CLOSING/CLOSED; leaks
  }
},
```

`onError` is already available in the channel closure (`ws-client.ts:36-41`,
default `NOOP`). Test patterns live in
`packages/devframe/src/rpc/transports/ws.test.ts` (the `CapturingWS` fake stubs
`WebSocket` with a controllable `readyState` and `addEventListener`/`removeEventListener`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/rpc/transports/ws.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/rpc/transports/ws-client.ts`
- `packages/devframe/src/rpc/transports/ws.test.ts`

**Out of scope**: adding reconnect to the transport (separate feature) and any
birpc-level call rejection.

## Git workflow

- Branch: `advisor/011-ws-client-post-closed`.
- Commit style: `fix(rpc): stop leaking an open listener when posting on a closing/closed socket`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Only queue on CONNECTING; notify + clean up otherwise

```ts
post: (data: string) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data)
    return
  }
  if (ws.readyState === WebSocket.CONNECTING) {
    const onOpen = () => {
      cleanup()
      if (ws.readyState === WebSocket.OPEN)
        ws.send(data)
    }
    const onClose = () => cleanup()
    function cleanup() {
      ws.removeEventListener('open', onOpen)
      ws.removeEventListener('close', onClose)
    }
    ws.addEventListener('open', onOpen)
    ws.addEventListener('close', onClose) // drop the queued send if it closes first
    return
  }
  // CLOSING or CLOSED: the socket will never (re)open on this channel.
  onError(new Error('Devframe WebSocket is not open; message dropped'))
},
```

### Step 2: Tests

Add to `ws.test.ts` using a `CapturingWS`-style fake (extend the existing one to
track listeners + expose a settable `readyState`):

```ts
it('does not queue an open listener when posting on a CLOSED socket', () => {
  const errors: Error[] = []
  let addCount = 0
  class FakeWS {
    static OPEN = 1; static CONNECTING = 0; static CLOSING = 2; static CLOSED = 3
    readyState = 3 // CLOSED
    constructor(public url: string) {}
    addEventListener(type: string) { if (type === 'open') addCount++ }
    removeEventListener() {}
    send() {}
  }
  vi.stubGlobal('WebSocket', FakeWS)
  try {
    const channel = createWsRpcChannel({ url: 'ws://127.0.0.1:1', onError: e => errors.push(e) })
    channel.post!('hello')
    expect(addCount).toBe(0)          // no leaked open listener
    expect(errors).toHaveLength(1)    // caller notified
  }
  finally {
    vi.stubGlobal('WebSocket', WebSocket)
  }
})

it('queues once and cleans up on CONNECTING → open', () => {
  // readyState = CONNECTING (0); assert exactly one open listener is added,
  // then removed after firing open. (Model after CapturingWS with dispatch.)
})
```

Match the `WebSocket` constant values the code compares against; the fake must
expose `OPEN/CONNECTING/CLOSING/CLOSED` statics. Restore the real `WebSocket`
in `finally` (the existing suite depends on it for the connection tests).

**Verify**: `pnpm exec vitest run packages/devframe/src/rpc/transports/ws.test.ts`
→ all pass.

## Test plan

- New: posting on CLOSED adds no `open` listener and calls `onError`; posting on
  CONNECTING queues exactly one listener that's removed after `open`/`close`.
- Existing ws tests keep passing.
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `post` only queues an `open` listener when `readyState === CONNECTING`.
- [ ] On CLOSING/CLOSED it calls `onError` instead of leaking a listener.
- [ ] The queued listener is removed on both `open` and `close`.
- [ ] New tests pass; existing ws tests still pass.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Notifying via `onError` breaks a consumer that treats `onError` as fatal (grep
  usages of `createWsRpcChannel`'s `onError`) — if so, use a quieter signal and
  say why.

## Maintenance notes

- This mitigates the leak/silent-drop; it does not add reconnect. A future
  reconnect feature should re-establish the socket and replay pending posts.
- Reviewer: confirm no `open` listener survives a `close`, and that OPEN-path
  behavior is unchanged.
