# Built-in Plugins — Planning Index

> Status: **planning only**. No implementation yet. These documents capture the
> shape, conventions, and per-plugin scope for a first-party `@devframes/plugin-*`
> ecosystem living under a new `plugins/*` workspace.

## Goal

Introduce a set of first-class devframe plugins that double as:

1. **The initial ecosystem bump** — concrete, useful tools people can install
   (`npx @devframes/plugin-git`, mount into Vite/Nuxt/Next, etc.).
2. **Dogfooding harnesses** — each plugin is built on a *different* frontend
   stack and exercises a *different* slice of devframe + `@devframes/hub`. Building
   them surfaces gaps in the framework before external authors hit them.

The seven planned plugins:

| # | Plugin | Package | Inspiration | Doc |
|---|--------|---------|-------------|-----|
| 1 | RPC & State self-inspector | `@devframes/plugin-inspect` | port of `vitejs/devtools` RPC/state panels | [01](./01-plugin-inspect.md) |
| 2 | Terminals | `@devframes/plugin-terminals` | replace Vite DevTools' terminal | [02](./02-plugin-terminals.md) |
| 3 | Git Dashboard | `@devframes/plugin-git` | GitLens | [03](./03-plugin-git-dashboard.md) |
| 4 | OG viewer | `@devframes/plugin-og` | Nuxt DevTools' OG image viewer | [04](./04-plugin-og-viewer.md) |
| 5 | A11y check | `@devframes/plugin-a11y` | axe-core / accessibility audits | [05](./05-plugin-a11y-check.md) |
| 6 | MCP inspector | `@devframes/plugin-mcp-inspect` | MCP inspector + Vercel evals | [06](./06-plugin-mcp-inspect.md) |
| 7 | Code-server | `@devframes/plugin-code-server` | code-server embed | [07](./07-plugin-code-server.md) |

The numbering is the **recommended build order** (see [Sequencing](#sequencing)),
not a priority ranking. We build one at a time.

## Two orthogonal axes

A recurring source of confusion: "stack" can mean two different things. Keep them
separate.

### Axis A — Host-integration exports (the unplugin parallel)

How the plugin *mounts*. One devframe definition, adapted to each host. This is
the [unplugin](https://github.com/unjs/unplugin) model: a single core plus a thin
per-target entry point.

- `.` — the `DevframeDefinition` (or a `createXDevframe(options)` factory returning one).
- `/cli` — standalone runner via `createCli(definition)`; backs the package `bin`.
- `/vite` — Vite plugin that mounts the devframe into a host dev server.
- `/nuxt` — Nuxt module.
- `/next` — Next.js route-handler helpers.
- `/rspack`, `/webpack` — bundler plugins.

Baseline every plugin ships: `.` + `/client` + `/cli` + `/vite`. The remaining
host targets are opt-in per plugin.

### Axis B — SPA implementation stack (the dogfooding lever)

What frontend framework the plugin's *own UI* is built with. devframe's SPA
contract is framework-neutral (relative `base`, runtime base discovery via
`document.baseURI`, `connectDevframe()`, `spa.loader` modes). Spreading the SPA
stack across plugins is how we prove that contract holds.

| Plugin | SPA stack (proposed) | Why this stack |
|--------|----------------------|----------------|
| RPC & State inspector | Vue + Vite | direct port from `vitejs/devtools` (Vue) |
| Terminals | Vanilla TS + Vite | lean, xterm.js; proves the no-framework path |
| Git Dashboard | Vue + Vite (or vanilla) | data-rich, reuses inspector primitives |
| OG viewer | Nuxt (static export) | port of Nuxt DevTools panel; proves Nuxt SPA |
| A11y check | React via rspack | proves the rspack build → static SPA path |
| MCP inspector | Next (static export) | React + Vercel AI/evals ecosystem |
| Code-server | Vanilla TS + Vite | thin shell around an embedded iframe |

> Axis A and Axis B are independent. A plugin whose UI is built with Nuxt (Axis B)
> can still expose `/vite`, `/cli`, `/next` host integrations (Axis A). The OG and
> MCP plugins are the natural places to *also* ship `/nuxt` and `/next`
> integrations, but that is a convenience, not a requirement.

## Package convention

Each plugin lives at `plugins/<short>/` and publishes as `@devframes/plugin-<short>`.
Model the package on `packages/devframe` (multi-entry tsdown) and `packages/nuxt`
(framework-peer pattern). Reference layout:

```
plugins/git/
  package.json
  tsdown.config.ts          # multi-entry: browser build + node build + combined dts
  src/
    index.ts                # `.`      → exports the DevframeDefinition / factory
    node/index.ts           # `/node`  → RPC functions + setup() logic
    client/index.ts         # `/client`→ setupBrowser, client commands, dock renderers
    cli.ts                  # `/cli`   → createCli(definition); referenced by `bin`
    vite.ts                 # `/vite`  → viteDevBridge-based host plugin
    nuxt.ts                 # `/nuxt`  → optional Nuxt module
    next.ts                 # `/next`  → optional Next helpers
    rpc/functions/*.ts      # individual defineRpcFunction definitions
    spa/                    # the plugin's own UI (built with its Axis-B stack)
  bin.mjs                   # #!/usr/bin/env node → createCli(definition).parse()
  test/
    __snapshots__/          # tsnapi API snapshots
```

### `package.json` shape

Follow `packages/devframe/package.json`:

- `"name": "@devframes/plugin-<short>"`, `"type": "module"`, `"sideEffects": false`.
- `"exports"` map pointing at `./dist/*.mjs` with `.d.mts` types, plus
  `"./package.json"`.
- `"bin": { "<short>": "./bin.mjs" }` for the standalone CLI.
- `devframe` (and `@devframes/hub` when the plugin uses docks/terminals/commands)
  as **peerDependencies** with `workspace:*`, mirroring `@devframes/nuxt`.
- Framework integrations (`vite`, `@nuxt/kit`, rspack, `next`) as **optional
  peers** so installing the plugin doesn't drag a bundler in.
- All real dependencies referenced via the pnpm **catalogs** in
  `pnpm-workspace.yaml` — never pin versions inline (per `AGENTS.md`).

## Repo wiring changes (one-time, when the workspace lands)

1. **`pnpm-workspace.yaml`** — add `plugins/*` to the `packages:` globs.
2. **`turbo.json`** — add a `@devframes/plugin-<short>#build` task per plugin,
   `dependsOn: ["devframe#build"]` (+ `"@devframes/hub#build"` if the plugin uses
   the hub). Mirror the existing example tasks.
3. **`alias.ts`** — add source-level aliases for each plugin sub-export
   (`@devframes/plugin-git`, `@devframes/plugin-git/client`, `/node`, `/vite`, …)
   so in-repo examples and tests resolve to `src/` without a build, exactly like
   the existing `devframe/*` and `@devframes/hub/*` entries. `alias.ts` already
   rewrites `tsconfig.base.json` paths on run.
4. **Catalogs** — add new third-party deps to the appropriate catalog
   (`deps`, `frontend`, `build`, `testing`). New entries likely needed:
   `simple-git`/`isomorphic-git`, `@xterm/xterm`, `satori`/`resvg`, `axe-core`,
   `code-server` (or proxy target). See each plugin doc.
5. **ESLint / tsconfig** — picked up automatically by the workspace globs; no
   per-plugin config beyond a `tsconfig.json` extending `tsconfig.base.json`.

## Build & test conventions

- **Build**: `tsdown`, three-config pattern from `packages/devframe/tsdown.config.ts`:
  1. browser build (`platform: 'browser'`, `dts: false`, `clean: true`) for
     `/client` and any browser-loaded `clientScript` modules — keeps node-only
     imports out of browser bundles;
  2. node build (`platform: 'node'`, `dts: false`, `clean: false`);
  3. combined dts (`platform: 'neutral'`, `emitDtsOnly: true`) so
     `declare module 'devframe'` RPC augmentations resolve across entries.
- The plugin's **SPA** builds separately with its Axis-B tool (Vite/Nuxt/Next/rspack)
  into `dist/spa`, referenced by `cli.distDir` with a relative asset base
  (`base: './'`) per the standalone-SPA principle in `AGENTS.md`.
- **Tests**: `vitest` + `tsnapi` API snapshots under `test/__snapshots__/`
  (`pnpm test` builds first so snapshots compare against fresh `dist/`).
  E2E via the root Playwright config where a live dev server matters
  (terminals, code-server, a11y).
- **Lint/typecheck/build gate** before any PR: `pnpm lint && pnpm test &&
  pnpm typecheck && pnpm build`.

## Conventions enforced per plugin

- **RPC**: every function via `defineRpcFunction` (or `defineHubRpcFunction` for
  hub-context functions), IDs namespaced `devframes-plugin-<short>:fn-name` (e.g.
  `devframes-plugin-git:status`, `devframes-plugin-terminals:list`). Augment `DevframeRpcServerFunctions` via
  `declare module 'devframe'` from the plugin's `rpc/index.ts`, as
  `files-inspector` does.
- **Shared state**: keys namespaced `devframes-plugin-<short>:*`, values serializable, via
  `devframe/utils/shared-state`.
- **Docks / commands / terminals / messages**: registered against the
  hub-augmented context (`DevframeHubContext`) using `ctx.docks.register`,
  `ctx.commands.register`, `ctx.terminals.register` / `startChildProcess`,
  `ctx.messages.add`. Use `defineDockEntry` / `defineCommand` for `when`-clause
  autocomplete.
- **Mount path**: never hardcode. Let `resolveBasePath` default to `/__<id>/`
  (hosted) or `/` (standalone); override only via `DevframeDefinition.basePath`.
- **Diagnostics**: node-side only, structured via `nostics`. Each plugin gets its own dedicated namespace using the format `DP_<SHORT>_00xx` (e.g., `DP_GIT_0001`, `DP_MCP_0001`).

### Diagnostics code allocation

Unlike `devframe` core (`DF00xx–DF07xx`) and `@devframes/hub` (`DF80xx–DF89xx`), which share the `DF` prefix, plugins define their own unique prefix:

| Prefix | Plugin |
|--------|--------|
| `DP_INSPECT_` | `@devframes/plugin-inspect` |
| `DP_TERMINALS_` | `@devframes/plugin-terminals` |
| `DP_GIT_` | `@devframes/plugin-git` |
| `DP_OG_` | `@devframes/plugin-og` |
| `DP_A11Y_` | `@devframes/plugin-a11y` |
| `DP_MCP_` | `@devframes/plugin-mcp-inspect` |
| `DP_CODE_SERVER_` | `@devframes/plugin-code-server` |

Each plugin keeps its own `diagnostics.ts` defined with `nostics` `defineDiagnostics` (`docsBase: 'https://devfra.me/errors'`). Community plugins can adopt a similar pattern (e.g., `DP_VENDOR_0001`) to avoid collisions.

## Dogfooding map — what each plugin stresses

The point of building these is to find devframe's rough edges. Expected coverage:

| Plugin | Primary devframe/hub surface exercised | Likely gaps it will surface |
|--------|----------------------------------------|-----------------------------|
| RPC & State inspector | RPC introspection, shared-state, RPC dump, `connectionMeta`, agent surface | introspection/meta APIs, dump fidelity, self-referential connection |
| Terminals | hub `terminals` host, `startChildProcess`, streaming channel, RPC streaming + replay | terminal lifecycle, stream backpressure/replay, resize/PTY support |
| Git Dashboard | RPC `query`/`snapshot`, shared-state, file watching, `json-render`, commands/docks | long-lived watchers, large payloads, snapshot vs live, error diagnostics |
| OG viewer | `views.hostStatic`, build adapter + `spa.loader` modes, Nuxt SPA neutrality | static asset serving, build-mode snapshot, Nuxt base discovery |
| A11y check | hub `messages` feed, client commands, `when`-clauses, embedded/iframe inspection, rspack SPA neutrality | message feed UX, client↔server command round-trips, rspack base handling |
| MCP inspector | `createMcpServer`, agent host surface, Next SPA neutrality, evals integration | MCP adapter coverage, agent→tool mapping, Next static export base |
| Code-server | `iframe` docks (incl. `remote`), embedded adapter, mount-path/proxy of a long-running upstream | proxying/WS pass-through, mount under `/__id/`, auth handshake |

## Sequencing

Recommended order and rationale:

1. **RPC & State inspector** — lowest risk (known-good port), self-validates the
   core RPC + shared-state + dump path, and becomes a debugging tool for building
   every subsequent plugin. Establishes the package/tsdown/alias scaffolding.
2. **Terminals** — first real consumer of the hub `terminals` subsystem +
   streaming; high reuse value; replaces a feature people already want.
3. **Git Dashboard** — first "real product" tool; stresses data-heavy RPC and
   reuses the inspector's UI primitives.
4. **OG viewer** — introduces the Nuxt SPA stack and the build/`spa.loader` path.
5. **A11y check** — introduces the rspack SPA stack and the messages feed.
6. **MCP inspector** — introduces the Next SPA stack and the MCP/agent + evals path.
7. **Code-server** — most infra-heavy (proxying a long-running upstream); best
   tackled once docks/mount/terminals patterns are battle-tested.

## Cross-cutting open questions

- **Shared UI kit**: inspector, git, terminals all need tables/trees/json views.
  Do we extract a `@devframes/plugin-ui` (framework-specific) or keep each SPA
  self-contained to maximize stack diversity? Leaning self-contained early, revisit
  after #3.
- **`/client` semantics**: confirm what belongs in the `/client` export
  (`setupBrowser`, client commands, `clientScript`/renderer modules) vs. the built
  SPA assets. The dock `clientScript`/`custom-render` entries need importable
  browser modules — those live in `/client`.
- **Standalone vs hosted defaults**: each plugin should work `npx`-standalone
  *and* mounted in a hub. Confirm the `bin` + `/vite` pair covers both for the
  reference path before generalizing to `/nuxt` `/next` `/rspack`.
- **Versioning/release**: these are `workspace:*`-pinned to `devframe`. Confirm
  they ride the monorepo `bumpp -r` release (human-approved) or get an independent
  cadence.
