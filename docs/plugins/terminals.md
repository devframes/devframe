---
outline: deep
---

# Terminals

A terminal panel — a **Svelte** SPA on [xterm.js](https://xtermjs.org/): streams read-only command output and runs interactive, TUI-capable PTY shells.

Package: `@devframes/plugin-terminals`

<figure class="screenshot">
  <img src="/screenshots/plugin-terminals-1.png" alt="Terminals screenshot" />
  <figcaption>Interactive and read-only terminal sessions in the browser</figcaption>
</figure>

## What it does

- **Read-only output** — a command's output via devframe's [streaming channels](/guide/streaming).
- **Interactive shells** — PTY-backed sessions you can type into, including full-screen TUI programs; rename, resize, restart, remove.
- **Presets** — named commands launchable in one click.

Interactive shells use [`zigpty`](https://github.com/pithings/zigpty)'s prebuilt native bindings (Linux/macOS/Windows, x64/arm64), falling back to pipe-based emulation where they can't load.

## Standalone

```sh
pnpx @devframes/plugin-terminals
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

`createTerminalsDevframe(options)` returns a definition; declare presets to seed the launcher:

```ts
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

export default createTerminalsDevframe({
  presets: [
    { id: 'dev', title: 'pnpm dev', command: 'pnpm', args: ['dev'] },
  ],
})
```

## Hub aggregation

Mounted into a hub, the plugin spawns on its own channel (`devframes:plugin:terminals:output`) and mirrors every session into `ctx.terminals` (the hub's registry, on `devframe:terminals`), so other tools share the list; foreign hub sessions render read-only.

`ctx.terminals` is the source of truth; the plugin is the sole PTY provider and duck-types a minimal `register` / `update` / `events` shape to run without `@devframes/hub`.

`startChildProcess()` sessions carry a `getResult()` accessor (`tinyexec`'s `Result`: `await`able `{ stdout, stderr, exitCode }`, plus live getters and `kill()`) — a `tinyexec`/`execa` runner drop-in.

## Focusing a session

Via the hub's [cross-iframe dock activation](/guide/hub#cross-iframe-dock-activation), an activation with a `sessionId` selects that session — a tool can jump the user to a build's output:

```ts
// e.g. right after ctx.terminals.startChildProcess(..., { id: sessionId, ... })
await rpc.call('hub:docks:activate', {
  dockId: 'devframes_plugin_terminals',
  params: { sessionId },
})
```

Focus is one-shot; an unknown id waits for the session to appear.

## Deep linking

Standalone, the panel keeps the selected session in the URL hash (`#id=<sessionId>`), so a copied link reopens the same terminal ([deep-linking guide](/guide/deep-linking)).

## RPC surface

Namespaced `devframes:plugin:terminals:*`:

| Function | Type | Purpose |
|----------|------|---------|
| `list` | `query` (snapshot) | Current sessions (status, mode, command). |
| `presets` | `query` (snapshot) | Declared launcher presets. |
| `spawn` | `action` | Start from a preset id or command + mode. |
| `write` | `action` | Input to an interactive session. |
| `resize` | `action` | Resize the PTY (columns × rows). |
| `restart` | `action` | Restart the process, keeping scrollback. |
| `rename` | `action` | Rename a session. |
| `terminate` | `action` | End the process; keep the session. |
| `remove` | `action` | Kill and discard the session. |
| `clear-exited` | `action` | Discard all stopped sessions. |

Status and mutations mirror into shared state, keeping panels in sync.

## Source

[`plugins/terminals`](https://github.com/devframes/devframe/tree/main/plugins/terminals)
