---
outline: deep
---

# Assets

Browse, preview, upload, rename, and delete the files in a directory, built as a **Vue** SPA on `@antfu/design` — a framework-neutral port of Nuxt DevTools' Assets tab.

Package: `@devframes/plugin-assets` · framework: **Vue + @antfu/design**

<figure class="screenshot">
  <img src="/screenshots/plugin-assets-1.png" alt="Assets plugin screenshot" />
  <figcaption>Assets plugin showing the file browser and details panel</figcaption>
</figure>

## What it does

Search by name and filter by type from an inline chip row, switch between a thumbnail grid (grouped by folder) and a file tree, and open a resizable right-hand details panel with a live preview (image, video, audio, font, or text), file metadata, and ready-to-copy usage snippets (`<img>`, CSS `background-image`, `@font-face`, a download link). Upload files with the toolbar button (native file picker) or by dropping them anywhere on the frame, and select multiple assets to delete them together. A live file watcher keeps every connected client's listing in sync with changes made outside the UI.

The standalone server requires devframe's trust handshake by default because it can read, write, and delete real files. Uploads, renames, deletes, and folder creation are enabled by default — pass `{ write: false }` (or `--read-only` on the standalone CLI) for a browse-only deployment.

## Standalone

```sh
pnpx @devframes/plugin-assets             # manages <cwd>/public
pnpx @devframes/plugin-assets --read-only # disable upload / rename / delete / mkdir
```

## Mount into a Vite host

```ts
// vite.config.ts
import assetsDevframe from '@devframes/plugin-assets'
import { devframeVite } from '@devframes/vite/dev-spa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    devframeVite(assetsDevframe),
  ],
})
```

## Programmatic

`createAssetsDevframe(options)` returns a definition you can deploy through any adapter:

```ts
import { createAssetsDevframe } from '@devframes/plugin-assets'

export default createAssetsDevframe({
  dir: 'static', // defaults to `<cwd>/public`
  baseURL: '/', // the URL the host serves `dir` at
  write: true,
  uploadExtensions: ['png', 'jpg', 'svg', 'webp'], // defaults to Nuxt DevTools' own allow-list, or '*' for any
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | `<cwd>/public` | Directory this devframe manages. |
| `baseURL` | `/` | URL base the host serves `dir` at — each asset's `publicPath` is `baseURL` + its path. Match a non-root deployment base (e.g. Nuxt's `app.baseURL`). |
| `write` | `true` | Enable upload, rename, delete, and folder creation from the UI. |
| `uploadExtensions` | Nuxt DevTools' allow-list | Extensions `upload` accepts, or `'*'` for any. |
| `serveStatic` | `false` | Serve the directory's bytes from this devframe itself. Left off when mounted into a host that already serves `public/`; the standalone CLI turns it on. |
| `build` | `false` | Register the `build` CLI subcommand. See [why it's off by default](#static-export) below. |

## How previews are served

Asset previews (`<img>`, `<video>`, download links) load the files by their **public URL**, and the host the plugin is mounted into serves those files — Vite, Nuxt, and most frameworks already serve their `public/` folder at `/`. The plugin never stands up its own byte-serving route; it just resolves each asset's `publicPath` as `baseURL` + the file's path. Point `baseURL` at wherever the host serves `dir` (the default `/` matches the usual `public/` convention). The standalone CLI (`pnpx @devframes/plugin-assets`) is its own host, so it flips `serveStatic` on and serves the directory under a dedicated base.

## RPC surface

All functions are namespaced `devframes:plugin:assets:*`:

| Function | Type | Notes |
|----------|------|-------|
| `list` | `query`, `snapshot: true` | Every file under the managed directory, with type, size, and last-modified time. |
| `capabilities` | `query`, `snapshot: true` | Whether write actions are enabled, and the upload allow-list — lets the UI gate itself proactively. |
| `read-image-meta` | `query` | Width, height, and orientation for an image asset. |
| `read-text` | `query` | Truncated text content, for preview. |
| `upload` | `action` | Allocates a streaming upload slot; the client pipes the file's bytes over the paired channel. |
| `rename` | `action` | Renames an asset within its folder, preserving its extension. |
| `delete` | `action` | Deletes one or more assets in a single call. |
| `mkdir` | `action` | Creates a folder, including missing parents. |
| `open-in-editor` / `reveal-in-folder` | `action` | Launch the asset in your editor, or reveal its containing folder in the OS file manager. Always registered, regardless of `write`. |

`upload` / `rename` / `delete` / `mkdir` are registered only when `write` is enabled.

## Static export

Every devframe's `build` CLI subcommand is disabled here by default (`capabilities: { build: false }`). A static export has no live host serving the files, and every write action is inherently excluded from a static dump. Rather than ship a broken, preview-less, write-less shell of the tool, the `build` command is simply not registered. Pass `{ build: true }` to `createAssetsDevframe()` (and `{ force: true }` if calling `createBuild()` directly) if that degraded export is still useful to you — the file listing itself still bakes into the static RPC dump.

## Source

[`plugins/assets`](https://github.com/devframes/devframe/tree/main/plugins/assets)
