# Plugin 02 — Terminals

**Package:** `@devframes/plugin-terminals` · **Dir:** `plugins/terminals/`
**Inspiration:** replace Vite DevTools' built-in terminal panel with a portable,
hub-native one.
**SPA stack (Axis B):** Vanilla TS + Vite (+ `@xterm/xterm`).
**Diagnostics band:** `DP_TERMINALS_00xx`.

## What it does

A terminal panel: list registered terminal sessions, stream their live output,
spawn new child-process terminals (configurable allowed commands), and
terminate/restart them. The host already provides most of this — the hub
`terminals` host (`packages/hub/src/node/host-terminals.ts`) exposes `register`,
`update`, and `startChildProcess` (via `tinyexec`) and mirrors output into the
`devframe:terminals` streaming channel with `devframe:terminals:updated`
broadcasts. This plugin is the **reference UI + a thin spawn/control RPC** on top
of that subsystem.

## Dogfooding intent

Primary surface: **hub `terminals` host + `startChildProcess` + RPC streaming +
replay**. This is the first heavy consumer of streaming, so it will stress:

- the `devframe:terminals` streaming channel (backpressure, replay window for
  late-joining clients, ordering across stdout/stderr);
- session lifecycle (`terminate()`/`restart()`/`getChildProcess()`) and the
  `terminal:session:updated` events;
- whether the existing host API is enough to drive a full UI, or needs additions
  (resize/PTY, input/write-to-stdin, exit codes, env/cwd per session).

Expected gaps: interactive input (the current host streams output; a real
terminal needs stdin + PTY/resize), and replay semantics for reconnects.

## Host integrations (Axis A)

- `.` — `createTerminalsDevframe(options)` (allowed commands, default cwd) +
  default definition.
- `/cli` — standalone terminal panel bound to the launching shell's cwd.
- `/vite` — mount into a Vite host (the literal "replace Vite DevTools terminal"
  use case).
- `/client` — xterm mount + dock `custom-render` module.

## Package layout

```
plugins/terminals/
  src/
    index.ts
    node/index.ts       # setup(ctx): wire terminals host, register control RPCs + dock
    client/index.ts     # xterm.js renderer, attaches to devframe:terminals stream
    cli.ts
    vite.ts
    rpc/
      index.ts
      functions/
        spawn.ts        # devframes-plugin-terminals:spawn   (action) → ctx.terminals.startChildProcess
        terminate.ts    # devframes-plugin-terminals:terminate (action)
        restart.ts      # devframes-plugin-terminals:restart (action)
        write.ts        # devframes-plugin-terminals:write   (action) — stdin, IF host gains support
        list.ts         # devframes-plugin-terminals:list    (query)
    spa/
  bin.mjs
  test/
```

## Node side

- Uses `ctx.terminals` directly; control RPCs are thin wrappers that call into the
  host and return session descriptors.
- `devframes-plugin-terminals:spawn` validates the requested command against an allow-list passed
  to `createTerminalsDevframe` (security: never spawn arbitrary commands from the
  client without opt-in). Diagnostics `DP_TERMINALS_00xx` for disallowed command / unknown
  session / spawn failure.
- Subscribes the UI to the `devframe:terminals` streaming channel and
  `devframe:terminals:updated` broadcast.

## Client side

- Vanilla TS + xterm.js. One xterm instance per session, fed from the streaming
  channel reader; tabs/list driven by `devframes-plugin-terminals:list` + the updated broadcast.
  Toolbar: spawn (from allow-list), terminate, restart, clear.

## Milestones

1. Scaffold (copy from #1). Dock + `devframes-plugin-terminals:list` + render existing sessions'
   buffered output.
2. Live streaming via `devframe:terminals` channel into xterm; reconnect/replay.
3. `devframes-plugin-terminals:spawn` / `terminate` / `restart` with allow-list.
4. (If host extended) stdin `devframes-plugin-terminals:write` + resize/PTY.
5. tsnapi snapshot + Playwright e2e (spawn → output → terminate).

## Open questions / risks

- **Interactive input / PTY.** The hub host today is output-streaming. A genuine
  replacement for the Vite DevTools terminal needs stdin and resize. Decide:
  extend `@devframes/hub` `terminals` host (preferred, benefits all consumers) vs.
  plugin-local PTY. This is the main framework-change candidate from this plugin.
- Replay window sizing for the streaming channel on reconnect.
- Security model for `spawn` (allow-list shape, default-deny).
- Overlap with code-server (#7), which also runs long-lived processes — keep the
  spawn/stream primitives reusable.
