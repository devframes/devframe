---
outline: deep
---

# Terminals

A portable terminal panel built as a **Svelte** SPA on top of [xterm.js](https://xtermjs.org/). It streams read-only command output and runs fully interactive PTY shells — TUI-capable — in the browser. The same definition runs standalone, mounts into a Vite host, or docks inside a hub.

Package: `@devframes/plugin-terminals` · framework: **Svelte + xterm.js**

## What it does

- **Read-only output** — stream the output of a command into a terminal view via devframe's [streaming channels](/guide/streaming).
- **Interactive shells** — spawn PTY-backed sessions you can type into, including full-screen TUI programs. Sessions can be renamed, resized, restarted, and removed; the session list lives in shared state so every panel stays in sync.
- **Presets** — declare named commands the user can launch with one click.

Interactive shells run on a real pseudo-terminal via [`zigpty`](https://github.com/pithings/zigpty)'s prebuilt native bindings (Linux/macOS/Windows, x64/arm64, no install scripts). Where the bindings can't load, sessions degrade to pipe-based terminal emulation.

## Standalone

```sh
npx @devframes/plugin-terminals
```

## Mount into a Vite host

```ts
// vite.config.ts
import { terminalsVite } from '@devframes/plugin-terminals/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    terminalsVite(),
  ],
})
```

## Programmatic

`createTerminalsDevframe(options)` returns a definition you can deploy through any adapter. Declare presets to seed the launcher:

```ts
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

export default createTerminalsDevframe({
  presets: [
    { id: 'dev', title: 'pnpm dev', command: 'pnpm', args: ['dev'] },
  ],
})
```

## Hub aggregation

Mounted into a hub, the plugin owns PTY/child-process spawning and its own streaming channel (`devframes-plugin-terminals:output`) — that's what the panel renders. It also mirrors every session it spawns into `ctx.terminals` (the hub's aggregate registry, streaming on `devframe:terminals`) so other tools — a launcher dock, a custom panel — see the same session list without depending on the plugin's own types. A session started the other way, via `ctx.terminals.startChildProcess` / `startPtySession` directly (e.g. from a launcher dock), shows up in the terminals panel too — the plugin reads foreign hub sessions read-only and renders them alongside its own, subscribing to the hub's channel for their output.

`ctx.terminals` is the source of truth for "what sessions exist"; the plugin is the panel that renders them and the one PTY-capable provider among possibly several session sources. The plugin never imports `@devframes/hub`'s types to stay mountable without a hub — it duck-types the minimal `register` / `update` / `events` shape it needs.

A session from `ctx.terminals.startChildProcess()` carries a `getResult()` accessor shaped like `tinyexec`'s `Result` — `await`able to `{ stdout, stderr, exitCode }` (captured separately from the merged display stream), with live `pid` / `exitCode` / `killed` getters and `kill()` in the meantime. That's the seam for migrating an existing `tinyexec`/`execa`-based "run a subprocess and get its result" API onto the hub's terminals: keep the same calling code, swap the runner for `startChildProcess()`, and the session's output shows up in every hub-aware terminal panel for free.

## Focusing a session

The panel reacts to the hub's [cross-iframe dock activation](/guide/hub#cross-iframe-dock-activation): when an activation targets this dock (`dockId: 'devframes-plugin-terminals'`) and carries a `sessionId`, the panel selects that session. This lets another tool spawn a build and jump the user straight to its output:

```ts
// e.g. right after ctx.terminals.startChildProcess(..., { id: sessionId, ... })
await rpc.call('hub:docks:activate', {
  dockId: 'devframes-plugin-terminals',
  params: { sessionId },
})
```

It works whether the panel is already open (it reacts to the `devframe:docks:active` shared-state slot) or mounts in response to the switch (it reads the slot on start and converges). Focus is one-shot: an unknown or not-yet-arrived session id waits for that session to appear, and the user's own tab clicks are always honored afterward. A session id that never appears is a no-op — the default selection (most-recent session) stands.

## Source

[`plugins/terminals`](https://github.com/devframes/devframe/tree/main/plugins/terminals)
