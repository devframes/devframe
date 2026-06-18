# Plugin 06 — MCP inspector

**Package:** `@devframes/plugin-mcp-inspect` · **Dir:** `plugins/mcp-inspect/`
**Inspiration:** the MCP inspector; optional Vercel AI SDK / evals integration.
**SPA stack (Axis B):** Next (static export) — React + the Vercel ecosystem.
**Diagnostics band:** `DP_MCP_00xx`.

## What it does

Inspect and exercise Model Context Protocol servers: connect to an MCP server
(stdio or HTTP), list its tools / resources / prompts, invoke tools with
arguments and inspect responses, browse resource contents, and view the request/
response log. Two complementary angles:

1. **Inspect external MCP servers** — a general MCP client UI.
2. **Inspect devframe's own MCP surface** — devframe already ships an MCP adapter
   (`createMcpServer`, `packages/devframe/src/adapters/mcp/`) that maps a
   devframe's `ctx.agent` surface to MCP tools/resources. This plugin can point at
   *that*, closing the loop and dogfooding the adapter.
3. **Evals (stretch)** — optional Vercel AI SDK integration to run eval prompts
   against tools and score responses.

## Dogfooding intent

Primary surface: **`createMcpServer` + the agent host + Next SPA neutrality +
evals path**. Stresses:

- the MCP adapter end to end: does `ctx.agent` → MCP tool/resource mapping expose
  enough for a real inspector? (`buildMcpServerFromContext` is `@internal`-exported
  for exactly this kind of testing.);
- `exposeSharedState` MCP resources;
- a Next `output: 'export'` static SPA mounting + connecting (the second React
  framework proof, distinct from a11y's rspack path);
- the agent-native story the docs describe (`docs/guide/agent-native.md`).

Expected gaps: MCP transports beyond `stdio` (the adapter currently throws
`DF0017` for non-stdio — an HTTP/SSE client is likely needed here and may push a
core addition), and agent-surface metadata richness.

## Host integrations (Axis A)

- `.` — `createMcpInspectorDevframe(options)` (target server config).
- `/cli` — `npx @devframes/plugin-mcp-inspect` → connect to an MCP server from the terminal.
- `/next` — first-class Next integration (the SPA is Next; host integration too).
- `/vite` — generic Vite host mount.
- `/client` — Next-built SPA + connect glue.

## Package layout

```
plugins/mcp-inspect/
  src/
    index.ts
    node/index.ts
    cli.ts
    next.ts
    vite.ts
    client/index.ts
    rpc/
      index.ts
      functions/
        connect.ts        # devframes-plugin-mcp-inspect:connect        (action) — open a client to a server
        list-tools.ts     # devframes-plugin-mcp-inspect:list-tools     (query, snapshot)
        invoke-tool.ts    # devframes-plugin-mcp-inspect:invoke-tool    (action)
        list-resources.ts # devframes-plugin-mcp-inspect:list-resources (query)
        read-resource.ts  # devframes-plugin-mcp-inspect:read-resource  (query)
        run-eval.ts       # devframes-plugin-mcp-inspect:run-eval       (action) — stretch, Vercel AI SDK
    spa/                  # Next, output: 'export', assetPrefix relative
  bin.mjs
  test/
```

## Node side

- MCP client via `@modelcontextprotocol/sdk` (already a catalog dep; optional peer
  in core). Manage connections in `devframes-plugin-mcp-inspect:connections` shared state.
- Optional: expose devframe's *own* MCP server via `createMcpServer` and let the
  inspector connect to it (self-inspection loop).
- Diagnostics `DP_MCP_00xx`: connect failure, unsupported transport, tool-invoke error,
  eval-provider missing.

## Client side

- Next SPA: server connection manager, Tools / Resources / Prompts browser, tool
  invoke form (schema-driven), response viewer, request log. Evals tab (stretch).

## Milestones

1. Scaffold + Next static-export SPA wired to `cli.distDir` (prove Next SPA mounts
   + connects).
2. `devframes-plugin-mcp-inspect:connect` (stdio) + `devframes-plugin-mcp-inspect:list-tools` + Tools browser.
3. `devframes-plugin-mcp-inspect:invoke-tool` (schema-driven form) + response viewer.
4. Resources/prompts browse + read.
5. Point at devframe's own `createMcpServer` (self-inspection); request log.
6. (Stretch) Vercel AI SDK evals tab.
7. tsnapi snapshot + e2e.

## Open questions / risks

- **Transports.** The core MCP *server* adapter is stdio-only today (`DF0017`).
  A *client* inspector likely needs HTTP/SSE + stdio. Decide whether transport
  support lands in the plugin or pushes a core/adapter addition.
- Evals scope — keep behind a flag and an optional Vercel AI SDK peer; don't block
  the core inspector on it.
- Next `output: 'export'` base discovery under `/__mcp/` (neutrality test).
- Security: connecting to / spawning arbitrary MCP servers — gate stdio spawn
  behind explicit config, mirror the terminals allow-list approach.
