# Plan 009: Fix two server-side streaming lifecycle leaks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/rpc-streaming.ts packages/devframe/src/node/__tests__/rpc-streaming.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (resource leaks)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

Two leaks in the server streaming host (`createRpcStreamingServerHost`):

1. **Untouched inbound never cleaned up**: `openInbound()` registers the reader in
   `state.inbound` immediately, but inbound ownership (`uploaderMeta` +
   `session.meta.uploadingStreams`) is only recorded when the *first* chunk
   arrives. Disconnect cleanup iterates only `meta.uploadingStreams`, so a client
   that obtains an inbound id and disconnects **before uploading anything** leaves
   a `ServerInboundRecord` in `state.inbound` forever, and any server handler
   doing `for await (const c of reader)` on it hangs indefinitely.
2. **Late subscribe to a closed stream pins it**: subscribing to an
   already-closed stream cancels its retention timer, replays the buffer, sends
   `end`, but never re-arms `maybeFreeStream`. The client deletes its reader on
   `end` without sending `unsubscribe`, so the `ServerStreamRecord` (buffer
   included) stays pinned until the whole WS session disconnects — defeating the
   `closedStreamRetention` window.

## Current state

`packages/devframe/src/node/rpc-streaming.ts`:

- `ServerInboundRecord` (`:29-33`): `{ reader, uploaderMeta? }`.
- `openInbound` (`:294-321`): builds `inboundRecord = { reader }`, `state.inbound.set(reader.id, inboundRecord)`. No owner captured at open time.
- First-chunk ownership (`:187-198`): sets `record.uploaderMeta` and
  `session.meta.uploadingStreams.add(...)` only on the first `upload-chunk`.
- Disconnect sweep (`:359-375`): iterates only `meta.uploadingStreams`.
- `subscribe` handler (`:108-137`): adds subscriber, `cancelRetention(record)`
  (`:115`), replays `record.sink.buffer` (`:118-128`), and if `record.sink.closed`
  sends `end` (`:129-137`) — then returns without re-arming retention.
- `maybeFreeStream` (`:68-85`): frees/schedules only when `record.sink.closed`
  **and** `record.subscribers.size === 0`.
- `getCurrentRpcSession()` returns the calling session inside a handler (the
  server wraps handlers in `AsyncLocalStorage` — see `node/server.ts:105-117`).

Test harness: `packages/devframe/src/node/__tests__/rpc-streaming.test.ts`
(`bootHost()` → real WS server; a `createRpcStreamingClientHost` client; uses
`get-port-please` + `ws`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/node/__tests__/rpc-streaming.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/node/rpc-streaming.ts`
- `packages/devframe/src/node/__tests__/rpc-streaming.test.ts`

**Out of scope**: the client streaming host (`client/rpc-streaming.ts`) — both
fixes are server-side, so no client protocol change is required. Do not touch it.

## Git workflow

- Branch: `advisor/009-streaming-lifecycle-leaks`.
- Commit style: `fix(streaming): clean up untouched inbounds and unpin closed-stream late-subscribers`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Capture inbound opener at open time

Add `openerMeta?` to `ServerInboundRecord`:

```ts
interface ServerInboundRecord<T = any> {
  reader: StreamReader<T>
  uploaderMeta?: DevframeNodeRpcSessionMeta
  openerMeta?: DevframeNodeRpcSessionMeta
}
```

In `openInbound` (`:294-321`), record the creating session so disconnect cleanup
can find an inbound that never received a chunk:

```ts
inboundRecord = { reader, openerMeta: rpc.getCurrentRpcSession()?.meta }
state.inbound.set(reader.id, inboundRecord)
if (inboundRecord.openerMeta) {
  inboundRecord.openerMeta.uploadingStreams ??= new Set()
  inboundRecord.openerMeta.uploadingStreams.add(streamKey(name, reader.id))
}
```

This routes untouched inbounds through the existing `_onSessionDisconnected`
sweep over `meta.uploadingStreams` (`:359-375`), which `_end`s the reader and
deletes the record. (When the first chunk later arrives, `uploaderMeta` is set
and the same key re-added to the same set — a `Set`, so it's idempotent.)

### Step 2: Unpin a closed stream's late subscriber

In the `subscribe` handler, after sending `end` for an already-closed stream,
remove the just-added subscriber and re-arm freeing (nothing more will be
delivered — the buffer was already replayed and the stream is closed):

```ts
if (record.sink.closed) {
  rpc.broadcast({ /* end ... */ })
  record.subscribers.delete(session.meta)
  session.meta.subscribedStreams?.delete(key)
  maybeFreeStream(state, id)
}
```

### Step 3: Tests

Add two cases to `rpc-streaming.test.ts` (model after the existing subscribe/
disconnect tests):

1. **Untouched inbound is freed on disconnect**: open an inbound via a server
   channel, do not upload any chunk, disconnect the client's WS, and assert the
   inbound record is gone (the reader ended). Use the harness's channel handle to
   check `state` indirectly (e.g. the reader's iteration ends rather than hangs) —
   assert with a timeout so a regression fails fast rather than hanging the suite.
2. **Late subscribe to a closed stream is unpinned**: start a stream with a small
   `replayWindow`, write + close it, then subscribe a client; after it receives
   the replay + `end`, assert the stream record is scheduled for free (or freed
   after `closedStreamRetention`) — e.g. by advancing timers or asserting a
   second late subscriber still gets the replay within the retention window, and
   that subscribers count returns to 0.

Keep tests deterministic with a short retention and `vi.useFakeTimers()` where
timer-based, or bounded `waitUntil`-style polling.

**Verify**: `pnpm exec vitest run packages/devframe/src/node/__tests__/rpc-streaming.test.ts`
→ all pass; the suite does not hang.

## Test plan

- Inbound opened-but-never-written is cleaned up on disconnect (no hang).
- Closed-stream late subscriber does not pin the record past retention.
- All existing streaming tests keep passing.
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `openInbound` records `openerMeta` and registers the key in `uploadingStreams`.
- [ ] Disconnect frees an inbound that never received a chunk (no leaked record, reader ended).
- [ ] Closed-stream `subscribe` removes the subscriber and calls `maybeFreeStream`.
- [ ] New tests pass and the suite does not hang.
- [ ] `pnpm exec vitest run packages/devframe/src/node/__tests__/rpc-streaming.test.ts` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- `openInbound` is sometimes called outside an RPC session context so
  `getCurrentRpcSession()` is undefined for a case you need to cover — the
  `openerMeta`-based cleanup only covers session-scoped opens; report the
  uncovered path rather than inventing a global sweep.
- Removing the late subscriber breaks a test expecting the subscriber to keep
  receiving something after `end` (there is nothing more to receive on a closed
  stream — but report if an assumption differs).

## Maintenance notes

- Both fixes are server-only; a future client change to send `unsubscribe` on
  `end` would be complementary but is not required.
- Reviewer: confirm no double-free (the `maybeFreeStream` after unpin, plus the
  disconnect sweep, must be idempotent — `freeStreamNow` guards on record existence).
