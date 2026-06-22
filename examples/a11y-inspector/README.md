# devframe-a11y-inspector

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
| **Panel** (`src/client`) | the devtools iframe | Solid SPA: lists violations, fires highlight/clear on hover |
| **Node** (`src/devframe.ts`, `src/rpc`) | the devframe backend | `get-config` RPC (impact taxonomy) — live in dev, baked in a static build |

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
pnpm -C examples/a11y-inspector build       # build the panel + the agent bundle
pnpm -C examples/a11y-inspector demo        # dev: live WebSocket RPC → http://localhost:4477/

pnpm -C examples/a11y-inspector cli:build   # bake the static deploy (dist/static)
pnpm -C examples/a11y-inspector demo:build  # static: baked RPC dump, no server
```

Open the URL, then hover any row in the panel — the matching element in the page
gets a focus ring (and scrolls into view if it's off-screen). Both demo modes
behave identically; the panel's `websocket` / `static` tag is the only tell.

Standalone, without a host app:

```sh
pnpm -C examples/a11y-inspector dev         # panel only, at /__devframe-a11y-inspector/
```

## File map

| Path | Purpose |
|------|---------|
| `src/devframe.ts` | the `DevframeDefinition` consumed by every adapter |
| `src/rpc/` | `get-config` static RPC + the type-safe client registry |
| `src/shared/protocol.ts` | the agent ↔ panel `BroadcastChannel` contract |
| `src/inject/` | the host-page agent (axe scan, highlight overlay) → `dist/inject/inject.js` |
| `src/client/` | the Solid panel SPA → `dist/client` |
| `demo/` | same-origin host page + server (dev + static modes) |
| `tests/` | dev-server RPC + static-build dump |
