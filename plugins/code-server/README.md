# @devframes/plugin-code-server

Run [code-server](https://github.com/coder/code-server) (VS Code in the
browser) as a devframe panel. The plugin detects a local `code-server`
install, launches it on demand, and embeds the editor in an
auto-authenticated `<iframe>`.

## How it works

- **Detection** — on startup it runs `code-server --version`. When the binary
  is missing, the launcher renders install instructions and links instead of a
  launch button.
- **Launch** — the launcher's button starts code-server as a managed child
  process bound to a free port, scoped to the workspace. Readiness is probed
  via code-server's `/healthz` endpoint.
- **Auto-auth** — code-server runs with password auth. The plugin generates a
  random token, sets `HASHED_PASSWORD` to its SHA-256, and hands the matching
  session cookie back to the already-authorized devframe client. The launcher
  applies that cookie for the current host before loading the iframe, so the
  editor opens already signed in — no code-server login page.

The editor iframe points at code-server's own origin
(`<protocol>//<host>:<port>/`), so WebSocket traffic flows directly without a
reverse proxy.

## Usage

### Standalone CLI

```sh
npx @devframes/plugin-code-server        # dev server + launcher
```

### Programmatic

```ts
import { createCodeServerDevframe } from '@devframes/plugin-code-server'

export default createCodeServerDevframe({
  // bin: 'code-server',     // binary to detect/launch (default: PATH)
  // serverPort: 8080,       // force a port (default: free port near 8080)
  // args: ['--disable-getting-started-override'],
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
| `devframes-plugin-code-server:detect` | query | Re-probe for the binary; returns `{ installed, version, bin }`. |
| `devframes-plugin-code-server:status` | query | Current status + auth cookie when running. |
| `devframes-plugin-code-server:start` | action | Launch and wait for readiness. |
| `devframes-plugin-code-server:stop` | action | Stop the process. |

Status (minus the auth cookie) is mirrored into the
`devframes-plugin-code-server:state` shared state for reactive UIs.
