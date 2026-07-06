# Plan 024: Batch stream-replay into one frame per resubscribe

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/rpc-streaming.ts packages/devframe/src/client/rpc-streaming.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches the streaming wire protocol; client + server must match)
- **Depends on**: plan 009 (also edits the `subscribe` handler) — land 009 first
- **Category**: perf
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

On resubscribe, the server replays the buffer as **one `rpc.broadcast` per
buffered chunk**, and each broadcast walks all connected clients to filter down
to the single resubscriber. Terminal replay windows are large
(`DEFAULT_SCROLLBACK = 5000`, hub `TERMINAL_REPLAY_WINDOW = 1000`), so one client
reconnecting to a busy terminal triggers up to 1000–5000 broadcasts — an
O(replayWindow × clients) burst and thousands of tiny WS frames. Sending the
replay as a single batched frame collapses that to O(1) frames.

## Current state

`packages/devframe/src/node/rpc-streaming.ts:117-128` (subscribe replay):

```ts
const afterSeq = opts?.afterSeq ?? 0
for (const buffered of record.sink.buffer) {
  if (buffered.seq > afterSeq) {
    rpc.broadcast({
      method: 'devframe:streaming:chunk',
      args: [channelName, id, buffered.seq, buffered.chunk],
      event: true, optional: true,
      filter: client => client.$meta === session.meta,   // scans all clients, per chunk
    })
  }
}
```

The live path (`:250-259`) also broadcasts per chunk but only to actual
subscribers — that's steady-state and fine; **this plan targets the replay burst
only**. The client handles `devframe:streaming:chunk` in
`packages/devframe/src/client/rpc-streaming.ts` (registers the chunk/end handlers).

Client+server ship together (workspace-pinned), so adding a new replay method to
both is safe — external consumers pin devframe as a whole.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Test | `pnpm exec vitest run packages/devframe/src/node/__tests__/rpc-streaming.test.ts` | all pass incl. replay case |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/node/rpc-streaming.ts` (emit a batched replay frame)
- `packages/devframe/src/client/rpc-streaming.ts` (handle the batched frame)
- `packages/devframe/src/types/*` if a new client method needs a type augment
- `packages/devframe/src/node/__tests__/rpc-streaming.test.ts` (replay ordering test)

**Out of scope**: the live per-chunk path (leave as-is), and inbound streams.

## Git workflow

- Branch: `advisor/024-batch-stream-replay`.
- Commit style: `perf(streaming): batch stream replay into a single frame per resubscribe`.

## Steps

### Step 1: Add a batched replay client method

Register a client-side handler `devframe:streaming:replay(channel, id, chunks: [seq, chunk][])`
in `client/rpc-streaming.ts` that iterates the array and feeds each `[seq, chunk]`
into the same reader path the per-chunk `devframe:streaming:chunk` handler uses
(reuse that logic — extract a helper if needed). Add the method to the client
function types alongside the existing streaming methods.

### Step 2: Emit one replay frame server-side

Replace the per-chunk replay loop with a single collect + one targeted broadcast:

```ts
const afterSeq = opts?.afterSeq ?? 0
const replay = record.sink.buffer.filter(b => b.seq > afterSeq).map(b => [b.seq, b.chunk] as const)
if (replay.length) {
  rpc.broadcast({
    method: 'devframe:streaming:replay',
    args: [channelName, id, replay],
    event: true, optional: true,
    filter: client => client.$meta === session.meta,
  })
}
```

Keep the subsequent `end` broadcast (and, from plan 009, the closed-stream
unpin). Order matters: replay must arrive before `end`.

### Step 3: Test replay ordering + completeness

Add to `rpc-streaming.test.ts`: start a stream with `replayWindow`, write several
chunks, then subscribe a late client and assert it receives **all** buffered
chunks in order (now via the batch), followed by `end` when closed. Also assert a
second live chunk after resubscribe still arrives via the per-chunk path.

**Verify**: `pnpm exec vitest run packages/devframe/src/node/__tests__/rpc-streaming.test.ts`
→ all pass.

## Test plan

- Late subscriber receives the full ordered replay via one frame; live chunks
  after resubscribe still stream per-chunk; `end` ordering preserved.
- Existing streaming tests pass.
- Typecheck + lint clean.

## Done criteria

- [ ] Server emits one `devframe:streaming:replay` frame instead of N `chunk` frames on resubscribe.
- [ ] Client handles the batched frame, preserving chunk order before `end`.
- [ ] New replay test passes; existing streaming tests pass.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- Introducing a new wire method risks breaking a static/other transport that
  doesn't implement it — the batch path must be gated to the WS transport used at
  resubscribe (report if the abstraction makes that hard).
- Plan 009 hasn't landed and you'd edit the same subscribe handler lines — land 009 first.

## Maintenance notes

- This changes the streaming protocol; both ends ship together, so keep them in
  one PR. Document the new `devframe:streaming:replay` method wherever the
  streaming methods are listed.
- Reviewer: confirm ordering (replay before end) and that live streaming is untouched.
