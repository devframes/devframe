# Plugin 04 — OG viewer

**Package:** `@devframes/plugin-og` · **Dir:** `plugins/og/`
**Inspiration:** Nuxt DevTools' Open Graph image viewer.
**SPA stack (Axis B):** Nuxt (static export) — the marquee proof that a Nuxt-built
SPA is a drop-in devframe client.
**Diagnostics band:** `DF93xx`.

## What it does

Preview and debug Open Graph / social-card metadata and images for routes:
render the resolved OG/Twitter meta tags for a given URL, show a live preview of
the social card across platforms (Twitter, Facebook, Discord, Slack), and — when
the project generates OG images (e.g. satori-based) — preview/iterate those
images with parameter tweaking.

## Dogfooding intent

Primary surface: **`views.hostStatic` static serving + the `build` adapter +
`spa.loader` modes + Nuxt SPA neutrality**. This plugin is the reason to ship a
Nuxt-built SPA, so it validates:

- a Nuxt `output: 'export'`-style static build mounting cleanly with relative
  base + runtime base discovery (`document.baseURI`), per the standalone-SPA
  principle in `AGENTS.md`;
- `createBuild` producing a self-contained static deploy of an OG report
  (`__connection.json` static backend + `__rpc-dump/` + `spa-loader.json`);
- the `spa.loader` modes (`'query'` to load a target URL from search params,
  `'none'` for a baked report) — the OG viewer is a natural `query`-loader SPA;
- serving generated image bytes through `ctx.views` / RPC.

Expected gaps: serving binary/image payloads over RPC vs. static routes, and Nuxt
base-path discovery when mounted under `/__og/`.

## Host integrations (Axis A)

- `.` — `createOgDevframe(options)` (routes/globs to scan, image generator hook).
- `/cli` — `npx @devframes/plugin-og` → scan a built site / dev server.
- `/nuxt` — first-class Nuxt module (the SPA is Nuxt; the host integration is too).
- `/vite` — generic Vite host mount.
- `/client` — Nuxt-built SPA assets + connect glue.

## Package layout

```
plugins/og/
  src/
    index.ts
    node/index.ts
    cli.ts
    vite.ts
    nuxt.ts
    client/index.ts
    rpc/
      index.ts
      functions/
        scan-routes.ts     # og:scan-routes   (query, snapshot)
        resolve-meta.ts    # og:resolve-meta  (query) — fetch+parse a URL's head
        render-image.ts    # og:render-image  (query) — bytes / data URL
    spa/                   # Nuxt app, output: 'export', assetPrefix relative
  bin.mjs
  test/
```

## Node side

- `og:resolve-meta` fetches a target URL (or reads built HTML) and parses
  `og:*` / `twitter:*` meta into a structured snapshot.
- `og:render-image` optionally renders via `satori` + `resvg` (add to catalog) or
  defers to a project-provided generator hook.
- Build mode: emit a static OG report so `createBuild` output can be deployed and
  shared. Diagnostics `DF93xx`: unfetchable URL, parse failure, render failure.

## Client side

- Nuxt SPA: URL/route picker, resolved meta table, multi-platform card preview,
  image preview with parameter controls. Must build with relative base and
  discover its mount base at runtime.

## Milestones

1. Scaffold + Nuxt SPA build wired to `cli.distDir` (prove Nuxt static export
   mounts and connects).
2. `og:resolve-meta` + meta table + card preview.
3. `og:scan-routes` to populate the route picker.
4. `og:render-image` (satori) or generator-hook path.
5. `build` adapter snapshot (deployable report) + `spa.loader: 'query'`.
6. tsnapi snapshot + e2e.

## Open questions / risks

- **Binary image transport.** RPC dump is JSON/structured-clone oriented; decide
  data-URL-over-RPC vs. a static route via `ctx.views` for image bytes.
- Nuxt static export base discovery under `/__og/` — the key neutrality test.
- Scope of the built-in renderer (satori) vs. relying on the host project's own OG
  generation. Lean on a hook; bundle satori as opt-in.
- Porting effort from Nuxt DevTools' implementation (Vue/Nuxt → standalone Nuxt
  app talking to devframe RPC instead of Nuxt DevTools RPC).
