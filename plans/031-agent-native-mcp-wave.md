# Plan 031: Agent-native MCP wave — bridges, core surface, connector

> **Executor instructions**: This is an **umbrella plan** executed in three
> phase-batched PRs. Each phase is independently shippable and gated by
> `pnpm lint && pnpm test && pnpm typecheck && pnpm build`. Honor the STOP
> conditions; update this plan's row in `plans/README.md` as phases land.

## Status

- **Priority**: P2
- **Effort**: L (three phases)
- **Risk**: LOW-MED (additive, experimental surface)
- **Depends on**: — (PR #140 / `@devframes/next` already merged)
- **Category**: direction
- **Planned at**: commit `51c8b29`, 2026-07-28

## Why this matters

Devframe already made the architectural bet Vercel's `next-devtools-mcp`
validated in its 0.4.0 rewrite: the real MCP endpoint belongs **inside the
framework** (Next 16's `/_next/mcp` ⇔ devframe's `/__mcp` + `devframe mcp`),
with a thin external connector doing discovery + proxy + gateways. Devframe has
the embedded half; this wave builds the connector half and adopts the
conventions Vercel proved out (agent-steering errors, gateway tools,
tools-first surface), demonstrable end-to-end via `@devframes/next` — the
literal "/_next/mcp" shape on devframe primitives.

## Non-goals

- **Telemetry** — rejected, not deferred: devframe is a headless OSS primitive;
  usage reporting is a downstream product decision.
- **Transparent tool re-projection** in the connector (each discovered tool as
  a first-class namespaced tool with `list_changed` forwarding) — documented
  follow-up; v1 ships the two-tool index/call gateway.
- **git write ops** (`stage`/`unstage`/`commit`) stay agent-invisible.
- **MCP resources/prompts expansion** — tools-first, matching client reality.

## Phase 1 — quick wins (PR 1)

1. **Bridge MCP forwarding** — both hosted bridges gain an `mcp` option
   (`boolean | McpRouteOptions`, forwarded to `createDevServer`) and advertise
   the endpoint in their hand-rolled connection meta:
   - `viteDevBridge` (`packages/devframe/src/helpers/vite.ts`)
   - `createDevframeNextHandler` (`packages/next/src/handler.ts`)
   `ConnectionMeta['mcp']` gains an optional `port` (side-car servers live on
   their own origin, mirroring `ConnectionMetaWebsocket.port`).
2. **nostics → MCP structured errors** — `formatMcpError`
   (`packages/devframe/src/adapters/mcp/stringify.ts`) detects a nostics
   `Diagnostic` and emits structured JSON
   `{ error: { code, message, fix?, docs? } }` so agents receive the coded
   next-step (`fix`) and the docs URL instead of a bare message string.
3. **Stale comment** — `build-server.ts` header still says HTTP transport is
   "planned"; it shipped in `http.ts`.
4. **Docs** — `docs/guide/agent-native.md` gains the conventions this wave
   standardizes: agent-steering tool descriptions (description-as-mini-prompt),
   the gateway-tool pattern (tools that return paths/instructions instead of
   proxying work), and the structured-error contract.

## Phase 2 — core surface (PR 2)

5. **Fetch-handler extraction** — split `mountMcpHttp`
   (`packages/devframe/src/adapters/mcp/http.ts`) into a framework-agnostic
   `createMcpFetchHandler(ctx, options)` (web `Request` → `Response`, owns the
   session map + origin gate) and a thin h3 wrapper. Enables non-h3 hosts —
   `@devframes/next`'s host serves via `app.fetch` already.
6. **Core `read_state` tool** — one built-in MCP tool in
   `buildMcpServerFromContext`: `read_state(key?)`; no key → key list, with
   key → JSON value. Honors the same `exposeSharedState` filter as the
   resource projection (which stays — many clients only consume tools).
7. **Hub commands → agent bridge** — opt-in `agent?: { description, safety?,
   args? }` on `DevframeServerCommandInput` (mirrors the RPC convention;
   description required; optional valibot args schema reusing
   `valibotArgsToJsonSchema`, zero-arg default). `createHubContext` projects
   agent-flagged, handler-bearing server commands into `ctx.agent` tools,
   tracking register/update/unregister. `when` clauses evaluate client-side
   only and are **not** enforced for agent calls — documented caveat.
8. **git read-only five** — `status`/`log`/`show`/`branches`/`diff` gain
   valibot args schemas + `agent` descriptions (`safety: 'read'`).
   Cross-reference plan 029 (also touches `plugins/git`) — serialize if both
   are in flight.

## Phase 3 — flagship: registry + connector + proof (PR 3)

9. **Instance registry** — `registerDevframeInstance(record)` exported from
   `devframe/node`: atomic per-instance JSON at
   `~/.devframe/instances/<pid>-<port>.json`
   (`{ pid, port, host, basePath, name, id, rootDir, mcp: { path } | null,
   startedAt }`), removed on close, pruned on read by failed
   `__connection.json` probes. `createDevServer` registers automatically
   (covers CLI dev, vite bridge, and the Next side-car);
   `createDevframeNextHost` calls it explicitly for the in-process path.
10. **`devframe` bin + `connect`** — first real bin on the `devframe` package.
    `devframe connect` runs a stdio MCP server exposing two gateway tools:
    - `devframe_index` — list live instances (registry read + liveness probe +
      prune) and each MCP-enabled instance's tools; instances with `mcp: null`
      carry a funnel hint ("restart with `--mcp`…").
    - `devframe_call` — invoke one tool on one instance (SDK client over
      Streamable-HTTP to the instance's advertised `mcp` endpoint).
    `--port <n>` probes an explicit port besides the registry. Requires the
    optional `@modelcontextprotocol/sdk` peer; a missing peer produces a coded
    diagnostic with install instructions.
11. **In-process MCP for `@devframes/next`** — `createDevframeNextHost` gains
    `mountMcp(ctx, base, options?)` built on `createMcpFetchHandler`, so a
    Next app serves MCP from its own origin (the `/_next/mcp` shape). The hub
    example wires it and advertises it in its connection meta.
12. **Proof (CI e2e, both gates)**:
    - `examples/files-inspector`: register one gateway tool; e2e boots
      `dev --mcp`, runs `devframe connect` over stdio (MCP SDK client),
      asserts `devframe_index` discovers it and `devframe_call` round-trips.
    - `examples/minimal-next-devframe-hub`: e2e boots the Next dev server,
      asserts the connector discovers the in-process hub endpoint.
13. **Docs** — `docs/adapters/mcp.md` (+ agent-native guide): `devframe
    connect` client config, the registry contract, `mountMcp` for custom
    hosts.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Full gate | `pnpm lint && pnpm test && pnpm typecheck && pnpm build` | exit 0 |
| One package's tests | `pnpm vitest run <path>` | exit 0 |
| API snapshots refresh | `pnpm test` (tsnapi compares against fresh `dist/`) | snapshots updated intentionally |

## Done criteria

- [ ] Phase 1: both bridges forward + advertise MCP; `formatMcpError` emits
      `{ error: { code, message, fix?, docs? } }` for diagnostics; stale
      comment gone; conventions documented.
- [ ] Phase 2: `createMcpFetchHandler` public; `read_state` tool live;
      agent-flagged hub commands appear as MCP tools; git read-only five are
      agent-visible with schemas.
- [ ] Phase 3: instances self-register and prune; `devframe connect` indexes
      and calls a live app over stdio; Next host serves in-process MCP; both
      e2e gates green in CI.
- [ ] Every phase: full gate green, API snapshots updated deliberately, new
      node-side errors use coded diagnostics with docs pages.
- [ ] `plans/README.md` row updated per phase.

## STOP conditions

Stop and report if:
- The MCP SDK's Streamable-HTTP client cannot talk to the mounted endpoint
  (version skew) — pin/document the working SDK range instead of hand-rolling
  a JSON-RPC client.
- The commands bridge requires evaluating `when` server-side to be safe —
  descope to excluding `when`-gated commands rather than porting the evaluator.
- Booting Next in CI proves flaky — demote the Next e2e to a manually-verified
  walkthrough and note it here.

## Maintenance notes

- Everything ships `@experimental`, consistent with the existing agent/MCP
  surface.
- The connector's two-tool surface is the compatibility contract; transparent
  re-projection can layer on top without breaking it.
- Registry records are self-describing JSON — additive fields are safe.
