# Plugin 05 — A11y check

**Package:** `@devframes/plugin-a11y` · **Dir:** `plugins/a11y/`
**Inspiration:** axe-core powered accessibility auditing, surfaced as a devtool.
**SPA stack (Axis B):** React via **rspack** — the proof that an rspack build
produces a valid static devframe SPA.
**Diagnostics band:** `DP_A11Y_00xx`.

## What it does

Run accessibility audits against the app under development and present results:
violations grouped by impact (critical/serious/moderate/minor), the offending
DOM nodes + selectors, the failing WCAG rule, and remediation guidance. Two scan
modes: (a) in-page — `axe-core` runs inside the host app's window and reports
back; (b) headless — a node-side run against a URL via Playwright (reuse the
repo's existing Playwright dep).

## Dogfooding intent

Primary surface: **hub `messages` feed + client commands + `when`-clauses +
client↔server round-trips + rspack SPA neutrality**. Stresses:

- the `messages` host (`ctx.messages.add/update/remove`) as a diagnostics feed —
  violations map naturally onto message entries with `level`, file/element
  positions, and auto-dismiss; this is the first heavy `messages` consumer and
  will exercise FIFO eviction + the `devframe:messages:updated` broadcast;
- **client-side** command registration (`CommandsContext.register` from
  `@devframes/hub/client`) and a `clientScript` dock entry that runs `axe-core`
  inside the host page, then ships results back over RPC;
- `when`-clauses to show/hide actions based on scan state;
- an rspack-built React SPA mounting + connecting like any other.

Expected gaps: client→server result transport size, the `clientScript` execution
context capabilities, and message-feed UX at volume.

## Host integrations (Axis A)

- `.` — `createA11yDevframe(options)` (rules config, scan targets).
- `/cli` — headless scan of a URL, report to terminal + static report.
- `/vite` — in-page scan of the Vite app (primary interactive mode).
- `/client` — React SPA + the in-page `axe-core` `clientScript` module.

## Package layout

```
plugins/a11y/
  src/
    index.ts
    node/index.ts
    cli.ts
    vite.ts
    client/
      index.ts            # React SPA mount
      in-page-scan.ts     # clientScript: runs axe-core in host window
    rpc/
      index.ts
      functions/
        report.ts         # devframes-plugin-a11y:report        (action) — client posts results
        scan-headless.ts  # devframes-plugin-a11y:scan-headless (action) — node+Playwright run
        list-results.ts   # devframes-plugin-a11y:list-results  (query, snapshot)
    spa/                  # React, built with rspack
  bin.mjs
  test/
```

## Node side

- `devframes-plugin-a11y:report` receives results from the in-page `clientScript`, stores them in
  `devframes-plugin-a11y:results` shared state, and fans violations into `ctx.messages` (one entry
  per violation, deduped by rule+target). Diagnostics `DP_A11Y_00xx`: scan failure,
  Playwright unavailable, invalid rule config.
- `devframes-plugin-a11y:scan-headless` runs axe via Playwright against a URL (node-side), for the
  CLI/CI path.

## Client side

- React SPA (rspack): results dashboard grouped by impact, node highlighter
  (postMessage to host frame), rule detail + docs links.
- `in-page-scan.ts` is the browser module referenced by a `clientScript` dock
  entry — bundled by the browser tsdown config so no node imports leak.

## Milestones

1. Scaffold + rspack SPA build wired to `cli.distDir` (prove rspack static SPA
   mounts + connects).
2. In-page `clientScript` scan → `devframes-plugin-a11y:report` → `devframes-plugin-a11y:results` shared state +
   results dashboard.
3. Violations → `ctx.messages` feed; node highlighting.
4. `devframes-plugin-a11y:scan-headless` (Playwright) + CLI/CI report.
5. `when`-clause-driven actions; tsnapi snapshot + e2e.

## Open questions / risks

- **rspack → static SPA** is unproven in this repo; budget time for the build
  config (relative base, output shape matching `cli.distDir`). This is the core
  neutrality test for this plugin.
- `clientScript` execution context: confirm it can load `axe-core` and reach the
  host document; if sandboxed, fall back to a postMessage bridge.
- Message-feed volume — a big page yields many violations; dedupe + cap, lean on
  the host's FIFO eviction.
- Playwright as a (heavy, optional) peer for the headless path.
