---
outline: deep
---

# Code Server

Run [code-server](https://github.com/coder/code-server) (VS Code in the browser) as a devframe panel. The plugin detects a local install, launches it on demand, and embeds the editor in an auto-authenticated iframe. Its launcher UI is plain **vanilla TypeScript** — a state-driven view with no UI framework at all, which makes the framework-neutral point from the opposite end.

Package: `@devframes/plugin-code-server` · framework: **Vanilla TypeScript**

## What it does

- **Detection** — on startup it runs `code-server --version`. When the binary is missing, the launcher renders install instructions instead of a launch button.
- **Launch** — the launcher's button starts code-server as a managed child process bound to a free port, scoped to the workspace, and probes readiness via its `/healthz` endpoint.
- **Auto-auth** — the plugin generates a random token, sets code-server's `HASHED_PASSWORD` to its SHA-256, and hands the matching session cookie back to the already-authorized devframe client, so the editor opens already signed in.

The editor iframe points at code-server's own origin, so its WebSocket traffic flows directly without a reverse proxy.

## Standalone

```sh
npx @devframes/plugin-code-server
```

## Mount into a Vite host

```ts
// vite.config.ts
import { codeServerVite } from '@devframes/plugin-code-server/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    codeServerVite(),
  ],
})
```

## Programmatic

```ts
import { createCodeServerDevframe } from '@devframes/plugin-code-server'

export default createCodeServerDevframe({
  // bin: 'code-server',   // binary to detect / launch (default: PATH)
  // serverPort: 8080,     // force a port (default: free port near 8080)
})
```

## RPC surface

All functions are namespaced `devframes-plugin-code-server:*`:

| Function | Type | Purpose |
|----------|------|---------|
| `detect` | `query` | Re-probe for the binary; returns `{ installed, version, bin }`. |
| `status` | `query` | Current status plus the auth cookie when running. |
| `start` | `action` | Launch and wait for readiness. |
| `stop` | `action` | Stop the process. |

Status (minus the auth cookie) is mirrored into the `…:state` shared state for reactive UIs.

## Source

[`plugins/code-server`](https://github.com/devframes/devframe/tree/main/plugins/code-server)
