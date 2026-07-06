# Plan 003: Reject cross-origin WebSocket upgrades on the RPC socket

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> this plan's row in `plans/README.md` unless a reviewer told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/rpc/transports/ws-server.ts packages/devframe/src/node/server.ts packages/devframe/src/rpc/transports/ws.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds an opt-outable, loopback-permissive check) — see "behavioral change" note
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The RPC WebSocket accepts an upgrade based only on the URL **path**; it never
inspects the `Origin` header. Browsers allow *cross-origin* WebSocket
connections (unlike `fetch`), so **any web page open in the developer's browser**
can `new WebSocket('ws://localhost:9999/__devframe_ws')` and speak the full RPC
protocol — Cross-Site WebSocket Hijacking, and the same gap enables DNS
rebinding. This is the entry point that makes the rest of the RPC surface
remotely reachable (git reads, terminal spawns, shared-state writes). Auth is
deliberately deferred to host adapters (`node/server.ts:103-104`) and the
built-in CLIs ship `auth:false`, so **an origin check is the one mitigation that
does not depend on the auth handshake** and protects the standalone tools today.

The correct default for a localhost dev tool is *loopback-permissive*: allow
requests with no `Origin` (native, non-browser clients), allow any loopback
Origin (so legitimate cross-port localhost setups — e.g. a Vite app on `:5173`
driving a devframe socket on `:9999` — keep working), and reject everything else
unless explicitly allow-listed. A remote attacker page is served from a
non-loopback origin (`http://evil.example`), so it is rejected; DNS-rebinding
pages carry their real non-loopback `Origin` too.

## Current state

`packages/devframe/src/rpc/transports/ws-server.ts:119-142` — the upgrade
listener checks only the path, then calls `handleUpgrade` with no origin check:

```ts
function routeUpgrades(
  server: HttpServer | HttpsServer,
  ws: NodeAdapter,
  path: string | undefined,
  destroyUnmatched: boolean,
): () => void {
  const listener = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (path) {
      let pathname = req.url ?? '/'
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      }
      catch {}
      if (!pathMatches(pathname, path)) {
        if (destroyUnmatched)
          socket.destroy()
        return
      }
    }
    void ws.handleUpgrade(req, socket, head)   // ← no Origin/Host check
  }
  server.on('upgrade', listener)
  return () => server.off('upgrade', listener)
}
```

`WsRpcTransportOptions` (`ws-server.ts:36-82`) has `server`/`port`/`host`/`path`/
`destroyUnmatched`/`https`/`definitions`/callbacks — **no origin option**.
`attachWsRpcTransport` (`ws-server.ts:154-`) destructures those options and calls
`routeUpgrades(...)` near the end of the function (search for `routeUpgrades(`).

`packages/devframe/src/node/server.ts:128-142` calls `attachWsRpcTransport` and
already knows `bindHost` (`server.ts:85`) and the resolved port. It does not pass
any origin config today.

Repo-wide there is no `headers.origin` / `checkOrigin` / `verifyClient` handling
in `packages/`.

Test pattern to follow: `packages/devframe/src/rpc/transports/ws.test.ts`
(uses the `ws` package's `WebSocket`/`WebSocketServer`, `get-port-please`, and
`127.0.0.1`; the `ws` node client sends an `Origin` only when you pass one).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test (this file) | `pnpm exec vitest run packages/devframe/src/rpc/transports/ws.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/rpc/transports/ws-server.ts` (add option + verifier + wire into `routeUpgrades`)
- `packages/devframe/src/node/server.ts` (thread an `allowedOrigins` option through, default loopback-permissive)
- `packages/devframe/src/rpc/transports/ws.test.ts` (new tests)

**Out of scope** (do NOT touch):
- `packages/devframe/src/rpc/transports/ws-client.ts` — the client is unchanged.
- The auth/trust subsystem (`node/auth/*`) — this plan is origin-only; full auth
  enforcement is plan 032 (separate, breaking).
- `adapters/dev.ts` / `adapters/cli.ts` beyond what compiles — surfacing an
  `allowedOrigins` CLI flag is a follow-up, not required here.

## Git workflow

- Branch: `advisor/003-ws-origin-check`.
- Commit style: `feat(rpc)!: reject cross-origin WebSocket upgrades` (the `!`
  marks the behavioral change; document it in the body — see "Maintenance notes").
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a loopback-permissive origin verifier + option to `ws-server.ts`

Add an exported helper and an option. Target shape:

```ts
// near the top-level helpers (after pathMatches)
export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
    || h.endsWith('.localhost') || h.startsWith('127.')
}

/**
 * Default origin policy for a localhost dev tool: allow requests with no
 * `Origin` header (native, non-browser clients), allow any loopback origin
 * (so cross-port localhost dev setups keep working), and allow explicitly
 * configured origins. Everything else — a real remote page in the dev's
 * browser — is rejected.
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin)
    return true
  if (allowedOrigins.includes(origin))
    return true
  try {
    return isLoopbackHostname(new URL(origin).hostname)
  }
  catch {
    return false
  }
}
```

Add to `WsRpcTransportOptions`:

```ts
  /**
   * Extra origins to accept on the WS upgrade beyond the loopback default.
   * Add your LAN/tunnel origin here when reaching the tool from another host.
   * Pass `false` to disable origin checking entirely (not recommended).
   * Default: loopback-only.
   */
  allowedOrigins?: readonly string[] | false
```

### Step 2: Enforce it in `routeUpgrades`

Thread a `verifyOrigin` callback (or the `allowedOrigins` value) into
`routeUpgrades` and check it **after** the path gate, **before** `handleUpgrade`:

```ts
// inside the listener, after the path check passes:
if (allowedOrigins !== false && !isAllowedOrigin(req.headers.origin, allowedOrigins ?? [])) {
  socket.destroy()
  return
}
void ws.handleUpgrade(req, socket, head)
```

In `attachWsRpcTransport`, destructure `allowedOrigins` from options and pass it
down to `routeUpgrades` (add a parameter). Keep the check active on both the
`path`-scoped and no-`path` code paths.

### Step 3: Thread the option from `startHttpAndWs`

In `packages/devframe/src/node/server.ts`, add `allowedOrigins?: readonly string[] | false`
to `StartHttpAndWsOptions`, and pass it into the `attachWsRpcTransport(rpcGroup, { ... })`
call (`server.ts:128`). Default is loopback-permissive (i.e. pass through
`options.allowedOrigins`, letting the transport default apply when undefined).

### Step 4: Tests

Add to `ws.test.ts` (model after the existing `attachWsRpcTransport` tests):

1. **Rejects a cross-origin browser upgrade**: start a transport on `127.0.0.1`,
   connect with `new WebSocket(url, { headers: { Origin: 'http://evil.example' } })`
   (the `ws` package accepts `headers`); assert the socket never opens (an
   `error`/`close` fires before `open`, or the handshake fails).
2. **Allows a loopback origin**: connect with `{ headers: { Origin: `http://localhost:12345` } }`;
   assert an RPC call succeeds.
3. **Allows no-Origin (native client)**: the existing tests already connect with
   no Origin and must still pass — confirm they do.
4. **Honors `allowedOrigins`**: pass `allowedOrigins: ['http://evil.example']`
   and assert that origin now connects.

**Verify**: `pnpm exec vitest run packages/devframe/src/rpc/transports/ws.test.ts`
→ all pass.

## Test plan

- New cases in `ws.test.ts`: cross-origin rejected, loopback allowed, no-Origin
  allowed, configured origin allowed.
- Existing `ws.test.ts` cases keep passing (no-Origin native clients + shared-server).
- `pnpm --filter devframe typecheck` and `pnpm lint` clean.

## Done criteria

- [ ] `isAllowedOrigin` / `isLoopbackHostname` exported from `ws-server.ts`.
- [ ] `routeUpgrades` destroys upgrades whose `Origin` is present and disallowed.
- [ ] `allowedOrigins` option exists on both `WsRpcTransportOptions` and `StartHttpAndWsOptions`.
- [ ] `pnpm exec vitest run packages/devframe/src/rpc/transports/ws.test.ts` passes with the 4 new/confirmed cases.
- [ ] `pnpm --filter devframe typecheck` exits 0; `pnpm lint` exits 0.
- [ ] Only the 3 in-scope files changed (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Any existing `ws.test.ts` case breaks (e.g. a legitimate no-Origin client is
  rejected) — the default must not break native clients.
- crossws exposes its own upgrade/origin hook that supersedes `routeUpgrades`
  (i.e. the `open` hook is where you must check instead) — report the finding so
  the check goes in the right place.
- Threading `allowedOrigins` requires changing more than the 3 in-scope files to
  compile.

## Maintenance notes

- **Behavioral change (breaking for some setups)**: tools reached from a
  non-loopback origin (LAN IP, tunnel, custom domain) now need that origin in
  `allowedOrigins`, or must pass `allowedOrigins: false`. Call this out in the
  PR body and, when docs land, in the adapters/security page. Consider a
  follow-up exposing `allowedOrigins` as a CLI flag / definition option.
- This does **not** replace auth (plan 032). It is defense-in-depth that works
  even with `auth:false`.
- A reviewer should confirm the check is `Origin`-based (not `Host`-based) and
  that missing-Origin is allowed, so non-browser RPC clients still connect.
