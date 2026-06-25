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

Interactive shells require the optional `node-pty` peer; without it the panel still streams read-only output.

## Standalone

```sh
npx devframe-terminals
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

## Source

[`plugins/terminals`](https://github.com/devframes/devframe/tree/main/plugins/terminals)
