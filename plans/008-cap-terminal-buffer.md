# Plan 008: Cap the hub terminal `session.buffer` and stop restart-after-terminate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/hub/src/node/host-terminals.ts packages/hub/src/node/__tests__/host-terminals.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (buffer becomes a bounded tail; restart-after-terminate becomes a no-op)
- **Depends on**: none
- **Category**: bug (memory leak + lifecycle)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

Two lifecycle issues in `DevframeTerminalsHost`:

1. **Unbounded buffer**: every output chunk of every terminal session is pushed
   into `session.buffer` forever (the code comments it "unbounded history"). A
   long-running PTY/child-process (a `pnpm dev`, a `tail -f`) grows hub memory
   linearly with total output for the session's lifetime. The streaming sink is
   already bounded (`TERMINAL_REPLAY_WINDOW = 1000`); the buffer is not. Every
   other output buffer in the repo is capped (code-server supervisor 200 lines,
   hub messages FIFO).
2. **Restart-after-terminate spawns an orphan**: `terminate()` sets
   `streamClosed = true` and closes the stream controller; a later `restart()`
   re-spawns the process but the read loop/`onData` short-circuit on the
   `streamClosed` guard, so the new process produces no visible output and is
   left running unmanaged.

## Current state

`packages/hub/src/node/host-terminals.ts`:

- `:25` `const TERMINAL_REPLAY_WINDOW = 1000`
- `:104-105` `session.buffer ||= []; const sessionBuffer = session.buffer`
- `:125-128`:
  ```ts
  // Mirror to the legacy session.buffer used by `terminals:read` —
  // unbounded history kept for the snapshot endpoint.
  sessionBuffer.push(result.value)
  sink?.write(result.value)
  ```
- child-process `restart` `:245-248`:
  ```ts
  const restart = async () => {
    cp?.kill()
    cp = createChildProcess()
  }
  ```
- pty `restart` `:396-399`:
  ```ts
  restart: async () => {
    pty?.kill()
    pty = spawnPty()
  },
  ```
- `streamClosed` is the per-session flag set by `closeStream()`/`errorStream()`
  and by `terminate()`; the read loop guards on it (`:227`, `:337`).

Test file `packages/hub/src/node/__tests__/host-terminals.test.ts` uses
`createTerminalHost()` (fake streaming sink recording `write`/`close`), a
`ReadableStream` with a captured `controller`, and `waitUntil(...)`. Existing
tests assert `session.buffer` as an **array** (e.g. `toEqual(['hello'])`), so keep
`buffer` an array — just bound it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/hub/src/node/__tests__/host-terminals.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter @devframes/hub typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/hub/src/node/host-terminals.ts`
- `packages/hub/src/node/__tests__/host-terminals.test.ts`

**Out of scope**: the streaming channel itself (`utils/streaming-channel.ts`) —
its replay window is already bounded; do not change it here.

## Git workflow

- Branch: `advisor/008-cap-terminal-buffer`.
- Commit style: `fix(hub): bound terminal scrollback buffer and reject restart after terminate`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Cap the buffer

Add a constant near `TERMINAL_REPLAY_WINDOW`:

```ts
/** Max chunks retained in the per-session scrollback buffer (bounded like the replay window). */
const TERMINAL_BUFFER_LIMIT = 1000
```

After `sessionBuffer.push(result.value)` (`:127`), trim oldest-first:

```ts
sessionBuffer.push(result.value)
if (sessionBuffer.length > TERMINAL_BUFFER_LIMIT)
  sessionBuffer.splice(0, sessionBuffer.length - TERMINAL_BUFFER_LIMIT)
sink?.write(result.value)
```

### Step 2: No-op restart after terminate

In both `restart` closures, bail if the stream is already closed (i.e. the
session was terminated):

```ts
// child-process:
const restart = async () => {
  if (streamClosed) return
  cp?.kill()
  cp = createChildProcess()
}
// pty:
restart: async () => {
  if (streamClosed) return
  pty?.kill()
  pty = spawnPty()
},
```

### Step 3: Tests

Add to `host-terminals.test.ts`:

```ts
it('bounds the session scrollback buffer', async () => {
  const { host } = createTerminalHost()
  let controller: ReadableStreamDefaultController<string>
  const stream = new ReadableStream<string>({ start(c) { controller = c } })
  const session: DevframeTerminalSession = { id: 't', title: 'T', status: 'running', stream }
  host.register(session)
  for (let i = 0; i < 1200; i++) controller!.enqueue(`line-${i}`)
  await waitUntil(() => {
    expect(session.buffer!.length).toBeLessThanOrEqual(1000)
  })
  // Keeps the newest, drops the oldest.
  expect(session.buffer!.at(-1)).toBe('line-1199')
  expect(session.buffer!.includes('line-0')).toBe(false)
})

it('does not restart a terminated child-process session', async () => {
  const { host, sinks } = createTerminalHost()
  const session = await host.startChildProcess(
    { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
    { id: 'child', title: 'Child' },
  )
  await session.terminate()
  await waitUntil(() => { expect(sinks.get('child')?.closed).toBe(true) })
  await session.restart()
  // Stream stays closed; no orphan output stream.
  expect(sinks.get('child')?.closed).toBe(true)
})
```

**Verify**: `pnpm exec vitest run packages/hub/src/node/__tests__/host-terminals.test.ts`
→ all pass (existing `toEqual(['hello'])` array assertions still hold).

## Test plan

- New: buffer bounded at ≤1000, newest retained / oldest dropped; terminated
  child session's `restart()` doesn't resurrect the stream.
- Existing host-terminals tests keep passing.
- `pnpm --filter @devframes/hub typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `session.buffer` is trimmed to `TERMINAL_BUFFER_LIMIT` after each push.
- [ ] Both `restart` closures no-op when `streamClosed`.
- [ ] New tests pass; existing host-terminals tests still pass.
- [ ] `pnpm --filter @devframes/hub typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A downstream consumer is found that reads the *full* `session.buffer` history
  and relies on it being complete (grep `\.buffer` in `packages/` and consuming
  UIs) — capping would change its behavior; report before proceeding.
- Making `restart` a no-op after terminate breaks an existing test that expected
  restart-after-terminate to resurrect a session (report; the intended
  lifecycle may differ).

## Maintenance notes

- If a real `terminals:read`/snapshot endpoint is added later, it now returns a
  bounded tail — document that (it was never wired in-repo).
- Reviewer: confirm the buffer stays an array (tests assert array equality) and
  the trim is oldest-first.
