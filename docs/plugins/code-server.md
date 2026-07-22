---
outline: deep
---

# Code Server

Run VS Code in the browser as a devframe panel. The plugin detects a local editor binary, launches it on demand, and embeds the editor in an auto-authenticated iframe. Its launcher is a small **Vue** SPA built on the shared `@antfu/design` system, matching the rest of the devframe surfaces.

Package: `@devframes/plugin-code-server` · framework: **Vue**

## What it does

- **Detection** — on startup it probes the resolved binary with `--version`. When none is found, the launcher renders install instructions instead of a launch button.
- **Launch** — the launcher's button starts the editor as a managed child process bound to a free port, scoped to the workspace, and probes readiness before embedding it.
- **Auto-auth** — the plugin generates fresh auth material per launch and hands it to the already-authorized devframe client, so the editor opens already signed in. `code-server` uses a session cookie; `code serve-web` uses a connection token on the URL.

The editor iframe points at the server's own origin, so its WebSocket traffic flows directly without a reverse proxy.

## Backends

`mode: 'local'` (the default) embeds a server running on this machine. Pick the backend with `backend`, or leave it unset to auto-detect — the plugin prefers `code-server` on `PATH`, then falls back to the `code` CLI's `serve-web`.

| `backend` | Binary | Auth handoff |
|-----------|--------|--------------|
| `'code-server'` | Coder's [`code-server`](https://github.com/coder/code-server) | password + session cookie |
| `'ms-code-serve-web'` | Microsoft's [`code serve-web`](https://code.visualstudio.com/docs/remote/vscode-server) | connection token (`?tkn=`) |

## Tunnel mode

`mode: 'tunnel'` runs Microsoft's `code tunnel` and embeds the hosted `vscode.dev` editor. The first launch surfaces a device-login prompt (a verification URL and a one-time code) in the launcher; authentication is handled by `vscode.dev`. Tunnel mode always uses the `code` CLI.

## Standalone

```sh
pnpx @devframes/plugin-code-server
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
  // backend: 'code-server',    // 'code-server' | 'ms-code-serve-web' (default: auto-detect)
  // mode: 'local',             // 'local' | 'tunnel'
  // serverPort: 8080,          // force a port (default: free port near 8080)
  // startOnBoot: true,         // launch during setup instead of on demand
  // reuseExistingServer: true, // adopt a server already answering on the port
  // tunnel: { name: 'my-box' },
})
```

## RPC surface

All functions are namespaced `devframes:plugin:code-server:*`:

| Function | Type | Purpose |
|----------|------|---------|
| `detect` | `query` | Re-probe for the binary; returns `{ installed, version, bin, backend, mode }`. |
| `status` | `query` | Current status plus the connect descriptor when running. |
| `start` | `action` | Launch and wait for readiness. |
| `stop` | `action` | Stop the process. |

Status (minus the connect descriptor) is mirrored into the `…:state` shared state for reactive UIs.

## Source

[`plugins/code-server`](https://github.com/devframes/devframe/tree/main/plugins/code-server)
