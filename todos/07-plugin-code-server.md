# Plugin 07 — Code-server

**Package:** `@devframes/plugin-code-server` · **Dir:** `plugins/code-server/`
**Inspiration:** embed [code-server](https://github.com/coder/code-server) (VS
Code in the browser) as a devframe panel.
**SPA stack (Axis B):** Vanilla TS + Vite (thin shell around an `<iframe>`).
**Diagnostics band:** `DF96xx`.

## What it does

Run a code-server instance scoped to the workspace and surface it as a devframe
dock: an editor panel inside the hub/host. The plugin's own UI is minimal — a
status/launcher shell — because the real surface is code-server's own web UI
loaded in an `iframe` dock. Lifecycle: start code-server as a managed child
process (reuse the terminals spawn/stream primitives), wait for it to be ready,
proxy/expose it under the devframe mount path, and render it in an `iframe` dock.

## Dogfooding intent

Primary surface: **`iframe` docks (incl. `remote`) + embedded adapter +
mount-path/proxy of a long-running upstream + child-process management**. The most
infra-heavy plugin; stresses:

- the `iframe` dock entry type (`DevframeViewIframe`), including the `remote` /
  `RemoteDockOptions` variant and `connectRemoteDevframe()` if code-server needs a
  separate origin;
- mounting/proxying a long-lived upstream server under `/__code-server/` —
  `resolveBasePath` + `ctx.views` + WebSocket pass-through (code-server is
  WS-heavy);
- managing a long-running child process (overlaps #2 terminals — reuse those
  spawn/stream primitives rather than reinventing);
- the embedded adapter (`createEmbedded`) for runtime registration into a host.

Expected gaps: WebSocket proxying through the devframe host, auth/token
hand-off to code-server, and clean teardown on host restart.

## Host integrations (Axis A)

- `.` — `createCodeServerDevframe(options)` (binary path/port, workspace dir,
  auth).
- `/cli` — `npx @devframes/plugin-code-server` → launch + open editor.
- `/vite`, `/embedded` — mount into a host; embedded for runtime registration.
- `/client` — launcher/status shell + the iframe dock.

## Package layout

```
plugins/code-server/
  src/
    index.ts
    node/
      index.ts
      supervisor.ts        # start/stop code-server child process; readiness probe
      proxy.ts             # reverse-proxy + WS pass-through under the mount base
    cli.ts
    vite.ts
    client/index.ts        # status shell; the editor itself is an iframe dock
    rpc/
      index.ts
      functions/
        start.ts           # code-server:start  (action)
        stop.ts            # code-server:stop   (action)
        status.ts          # code-server:status (query)
    spa/
  bin.mjs
  test/
```

## Node side

- `supervisor.ts` spawns code-server (prefer reusing the hub `terminals`
  `startChildProcess` so output streams into the terminals panel too), probes
  readiness, and tracks state in `code-server:state` shared state.
- `proxy.ts` exposes code-server under the devframe mount base via `ctx.views` /
  the host's HTTP+WS server (`startHttpAndWs`), passing through WebSocket upgrades.
  Alternatively use the `remote` iframe dock so the browser talks to code-server's
  own origin directly (simpler, but requires that origin be reachable).
- Diagnostics `DF96xx`: binary not found, start timeout, port conflict, proxy
  failure.

## Client side

- Vanilla shell: a Start/Stop/Open control bar bound to `code-server:status`, and
  an `iframe` dock pointing at the mounted/remote code-server URL once ready.

## Milestones

1. Scaffold. `supervisor.ts` start/stop + `code-server:status` + readiness probe
   (no UI embed yet; verify via curl).
2. `iframe` dock pointing at code-server (direct origin / `remote` first — least
   proxy work).
3. Reverse-proxy + WebSocket pass-through under `/__code-server/` (same-origin).
4. Lifecycle hardening: teardown on host restart, port conflicts, auth hand-off.
5. CLI standalone launch + `/embedded` registration; e2e (start → iframe loads →
   stop).

## Open questions / risks

- **WebSocket proxying** through the devframe host is the hard part — confirm
  `startHttpAndWs` / `ctx.views` can pass through upstream WS upgrades, or default
  to the `remote` iframe approach (separate origin) to sidestep it. Likely the
  first decision in milestone 0.
- **Auth hand-off** — code-server's password/token vs. devframe's trust handshake.
- **Shipping code-server** — heavy binary; treat as an optional peer / detect a
  user-provided install rather than bundling.
- Reuse vs. duplicate the #2 terminals process-management primitives — prefer
  reuse; sequence after terminals is mature.
- Cross-platform binary launch quirks.
