# @devframes/plugin-code-server

> [!WARNING] Experimental
> This plugin is experimental and may change without a major version bump until
> it stabilizes.

Run VS Code in the browser as a devframe panel. The plugin detects a local
editor binary, launches it on demand, and embeds the editor in an
auto-authenticated `<iframe>`. The launcher is a **Vue** SPA built on the shared
`@antfu/design` system.

## How it works

- **Detection** — on startup it probes the resolved binary with `--version`.
  When none is found, the launcher renders install instructions instead of a
  launch button.
- **Launch** — the launcher's button starts the editor as a managed child
  process bound to a free port, scoped to the workspace. Readiness is probed
  before the iframe loads.
- **Auto-auth** — the plugin generates fresh auth material per launch and hands
  it to the already-authorized devframe client, so the editor opens already
  signed in. `code-server` uses a session cookie (`HASHED_PASSWORD`);
  `code serve-web` uses a connection token on the URL (`?tkn=`).

## Backends & modes

`mode: 'local'` (default) embeds a server on this machine; `backend` selects it,
or leave it unset to auto-detect (prefers `code-server`, then `code serve-web`).

| `backend` | Binary | Auth |
|-----------|--------|------|
| `'code-server'` | Coder [`code-server`](https://github.com/coder/code-server) | password + session cookie |
| `'ms-code-serve-web'` | Microsoft [`code serve-web`](https://code.visualstudio.com/docs/remote/vscode-server) | connection token (`?tkn=`) |

`mode: 'tunnel'` runs Microsoft's `code tunnel` and embeds the hosted
`vscode.dev` editor. The first launch surfaces a device-login prompt in the
launcher; `vscode.dev` handles authentication.

## Usage

### Standalone CLI

```sh
pnpx @devframes/plugin-code-server        # dev server + launcher
```

### Programmatic

```ts
import { createCodeServerDevframe } from '@devframes/plugin-code-server'

export default createCodeServerDevframe({
  // backend: 'code-server',    // 'code-server' | 'ms-code-serve-web' (default: auto)
  // mode: 'local',             // 'local' | 'tunnel'
  // serverPort: 8080,          // force a port (default: free port near 8080)
  // startOnBoot: true,         // launch during setup instead of on demand
  // reuseExistingServer: true, // adopt a server already answering on the port
  // tunnel: { name: 'my-box' },
})
```

### Vite host

```ts
import { codeServerVite } from '@devframes/plugin-code-server/vite'

export default {
  plugins: [codeServerVite()],
}
```

## RPC

| Function | Type | Purpose |
|----------|------|---------|
| `devframes:plugin:code-server:detect` | query | Re-probe; returns `{ installed, version, bin, backend, mode }`. |
| `devframes:plugin:code-server:status` | query | Current status + connect descriptor when running. |
| `devframes:plugin:code-server:start` | action | Launch and wait for readiness. |
| `devframes:plugin:code-server:stop` | action | Stop the process. |

Status (minus the connect descriptor) is mirrored into the
`devframes:plugin:code-server:state` shared state for reactive UIs.

## UI

The launcher is a Vue SPA (`src/spa`). `LauncherView.vue` is a pure,
state-driven view decoupled from RPC — every phase renders in isolation and has
a Storybook story; `App.vue` wires the live connection to it and mounts the
editor in a full-bleed, auto-authenticated iframe (`EditorFrame.vue`).

```sh
pnpm storybook         # dev
pnpm build-storybook   # static build
```

Stories: connecting, not-installed, launch, launch (serve-web), launch-error,
starting, tunnel-login, and a running editor frame (mock editor).
