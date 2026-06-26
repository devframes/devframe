# @devframes/plugin-a11y

> [!WARNING] Experimental
> This plugin is experimental and may change without a major version bump until
> it stabilizes.

An accessibility inspector built on [devframe](../../packages/devframe). It runs
[axe-core](https://github.com/dequelabs/axe-core) against a host application,
lists the WCAG A/AA violations in a [Solid](https://www.solidjs.com/) panel, and
**highlights the offending element in the page when you hover a warning**.

The scan + highlight loop works the same whether the plugin runs as a live dev
server or as a baked static build.

## How it works

Three pieces, two of them browser-side:

| Piece | Runs in | Role |
|-------|---------|------|
| **Agent** (`src/inject`) | the host app's page | runs axe-core, broadcasts the report, draws the highlight ring |
| **Panel** (`src/spa`) | the devtools iframe | Solid SPA: lists violations, fires highlight/clear on hover |
| **Node** (`src/index.ts`, `src/node`, `src/rpc`) | the devframe backend | `get-config` RPC (impact taxonomy) — live in dev, baked in a static build |

The agent and panel talk over a same-origin
[`BroadcastChannel`](src/shared/protocol.ts), not the devframe RPC backend. That
is what keeps the live loop working in **both modes**: neither half needs a
server to reach the other, only a shared browser origin (host page + panel
iframe). devframe RPC carries the data model on top — `get-config` is a `static`
function, so it resolves over WebSocket in dev and from the baked dump in a
static build.

devframe deliberately provides no access to the host application's DOM, so the
agent is the author-provided bridge: load one module script in the page you want
to check and it scans, reports, and highlights on demand.

## Run the demo

The demo serves an intentionally-broken host page and the panel from **one
origin** so they share the channel.

```sh
pnpm -C plugins/a11y build       # build the panel + the agent bundle
pnpm -C plugins/a11y demo        # dev: live WebSocket RPC → http://localhost:4477/

pnpm -C plugins/a11y cli:build   # bake the static deploy (dist/static)
pnpm -C plugins/a11y demo:build  # static: baked RPC dump, no server
```

Open the URL, then hover any row in the panel — the matching element in the page
gets a focus ring (and scrolls into view if it's off-screen). Both demo modes
behave identically; the panel's `websocket` / `static` tag is the only tell.

Standalone, without a host app:

```sh
pnpm -C plugins/a11y dev         # panel only, at /__devframe-a11y-inspector/
```

## File map

| Path | Export | Purpose |
|------|--------|---------|
| `src/index.ts` | `.` | `createA11yDevframe()` + the default `DevframeDefinition` |
| `src/node/index.ts` | `/node` | `setupA11y(ctx)` — registers the RPC functions |
| `src/cli.ts` | `/cli` | `createA11yCli()` — backs the `devframe-a11y-inspector` bin |
| `src/vite.ts` | `/vite` | `a11yVitePlugin()` — mounts the panel into a Vite host |
| `src/client/index.ts` | `/client` | `connectA11y()` — typed browser RPC client wrapper |
| `src/rpc/` | — | `get-config` static RPC + the type-safe client registry |
| `src/shared/protocol.ts` | — | the agent ↔ panel `BroadcastChannel` contract |
| `src/inject/` | — | the host-page agent (axe scan, highlight overlay) → `dist/inject/inject.js` |
| `src/spa/` | — | the Solid panel SPA → `dist/spa` |
| `demo/` | — | same-origin host page + server (dev + static modes) |
| `tests/` | — | dev-server RPC + static-build dump |
