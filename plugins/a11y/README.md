# @devframes/plugin-a11y

> [!WARNING] Experimental
> This plugin is experimental and may change without a major version bump until
> it stabilizes.

An accessibility inspector built on [devframe](../../packages/devframe). It runs
[axe-core](https://github.com/dequelabs/axe-core) against a host application and
surfaces the violations in a [Solid](https://www.solidjs.com/) panel:

- **Route-aware tracking** — buckets violations by `location.pathname` and tracks
  them as you navigate the app (History-API patched, framework-neutral), persisted
  in `sessionStorage` so history survives reloads within a tab session.
- **Dashboard + grouped violations** — a Dashboard tab (totals, severity
  breakdown, per-route inventory, scan controls) and a Violations tab listing
  every tracked route, grouped, with the active route marked.
- **Select + highlight** — hover previews the offending element; ticking a
  violation's checkbox selects it, giving the card a distinct state and drawing
  globally-numbered badges over all its elements in the page. `<html>`/`<body>`
  targets get a corner notice instead of a viewport-filling ring.
- **Generate fix prompts** — a nav button gathers the selected violations (rule
  metadata, WCAG tags, docs, and each element's selector/markup/failure summary,
  grouped by route) into one paste-ready AI prompt in a dialog.
- **Constant scanning** — a DOM `MutationObserver` plus debounced
  mouse/keyboard/touch rescans, toggleable from the Dashboard.
- **WCAG 2.0–2.2 + best-practice** — the broadened axe tag set, with best-practice
  rules tagged and filterable.
- **Console logging** — newly-appeared violations are logged (deduped) to the
  browser console.

The scan + highlight loop works the same whether the plugin runs as a live dev
server or as a baked static build.

## How it works

Three pieces, two of them browser-side:

| Piece | Runs in | Role |
|-------|---------|------|
| **Agent** (`src/inject`) | the host app's page | runs axe-core, tracks routes, broadcasts the aggregate state, draws the preview + pinned rings |
| **Panel** (`src/spa`) | the devtools iframe | Solid SPA: Dashboard + grouped violations, fires preview/pin/rescan |
| **Node** (`src/index.ts`, `src/node`, `src/rpc`) | the devframe backend | `get-config` RPC (impact taxonomy + runtime config) — live in dev, baked in a static build |

The agent and panel talk over a same-origin
[`BroadcastChannel`](src/shared/protocol.ts), not the devframe RPC backend. That
is what keeps the live loop working in **both modes**: neither half needs a
server to reach the other, only a shared browser origin (host page + panel
iframe). The agent owns the authoritative route → report map and broadcasts the
whole aggregate on every change, so the panel stays a pure render of it. devframe
RPC carries the data model on top — `get-config` is a `static` function, so it
resolves over WebSocket in dev and from the baked dump in a static build; the
panel forwards its runtime-config slice to the agent over the channel, keeping the
agent itself free of any RPC dependency.

devframe deliberately provides no access to the host application's DOM, so the
agent is the author-provided bridge into the page being checked. In a hub, the
agent is the a11y dock's **client script**: attach `a11yAgentBundlePath` as the
dock's `clientScript` (resolved to an importable URL — `/@fs/…` under Vite, or a
statically-served path) and the hub's client runtime (`createDevframeClientHost`
from `@devframes/hub/client`) imports it into the host page and calls its
default export with the client-script context. Booted that way, the agent also
mirrors the active route's scan into the hub's **messages feed** — a summary entry
driven through the loading → idle lifecycle plus one entry per violated rule,
carrying the impact-mapped level, WCAG tags as labels, and the first offending
element's selector and bounding box (rendered by `@devframes/plugin-messages` when
the hub mounts it). Each entry also carries a **navigation action**: clicking it
in the messages panel activates the a11y dock (`hub:docks:activate`) deep-linked
to the rule + route (or the Dashboard, for the summary). Both minimal hub examples
do exactly this. Outside a hub, one
`<script type="module">` for the same bundle does the job — the demo below
shows it (no hub context, so the feed mirror simply stays off).

## Configuration

Pass options to `createA11yDevframe()` (surfaced through `get-config`, so they
reach both the panel and the agent):

```ts
createA11yDevframe({
  autoScan: true, //         rescan on debounced interaction (default true)
  logIssues: true, //        log new violations to the console (default true)
  defaultHighlight: false, // auto-pin a route's violations on first scan (default false)
  axe: {
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
    runOptions: {}, //       extra axe `run` options merged over the defaults
  },
})
```

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
pnpx @devframes/plugin-a11y      # the published package, panel only, at /__devframes_plugin_a11y/
pnpm -C plugins/a11y dev         # from source: same, at /__devframes_plugin_a11y/
```

## File map

| Path | Export | Purpose |
|------|--------|---------|
| `src/index.ts` | `.` | `createA11yDevframe()` + the default `DevframeDefinition`; `a11yAgentBundlePath` — the agent module a hub attaches as this dock's client script |
| `src/node/index.ts` | `/node` | `setupA11y(ctx, options?)` — registers the RPC functions with the runtime config |
| `src/cli.ts` | `/cli` | `createA11yCli()` — backs the `devframes_plugin_a11y` bin |
| `src/vite.ts` | `/vite` | `a11yVitePlugin()` — mounts the panel into a Vite host |
| `src/client/index.ts` | `/client` | `connectA11y()` — typed browser RPC client wrapper |
| `src/rpc/` | — | `get-config` static RPC + the type-safe client registry |
| `src/shared/protocol.ts` | — | the agent ↔ panel `BroadcastChannel` contract |
| `src/inject/` | — | the host-page agent (axe scan, highlight overlay, hub messages mirror) → `dist/inject/inject.js` |
| `src/spa/` | — | the Solid panel SPA → `dist/spa` |
| `demo/` | — | same-origin host page + server (dev + static modes) |
| `tests/` | — | dev-server RPC + static-build dump |
