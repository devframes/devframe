---
outline: deep
---

# Assets

Browse, preview, upload, rename, and delete the files in a directory, built as a **Preact** SPA — a framework-neutral port of Nuxt DevTools' Assets tab.

Package: `@devframes/plugin-assets` · framework: **Preact**

## What it does

Search and filter by extension, switch between a thumbnail grid (grouped by folder) and a file tree, and open a details panel with a live preview (image, video, audio, font, or text), file metadata, and ready-to-copy usage snippets (`<img>`, CSS `background-image`, `@font-face`, a download link). Drag-and-drop files to upload them, or select multiple assets to delete them together. A live file watcher keeps every connected client's listing in sync with changes made outside the UI.

The standalone server requires devframe's trust handshake by default because it can read, write, and delete real files. Uploads, renames, deletes, and folder creation are enabled by default — pass `{ write: false }` (or `--read-only` on the standalone CLI) for a browse-only deployment.

## Standalone

```sh
pnpx @devframes/plugin-assets             # manages <cwd>/public
pnpx @devframes/plugin-assets --read-only # disable upload / rename / delete / mkdir
```

## Mount into a Vite host

```ts
// vite.config.ts
import { assetsVitePlugin } from '@devframes/plugin-assets/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    assetsVitePlugin(),
  ],
})
```

## Programmatic

`createAssetsDevframe(options)` returns a definition you can deploy through any adapter:

```ts
import { createAssetsDevframe } from '@devframes/plugin-assets'

export default createAssetsDevframe({
  dir: 'static', // defaults to `<cwd>/public`
  write: true,
  uploadExtensions: ['png', 'jpg', 'svg', 'webp'], // defaults to Nuxt DevTools' own allow-list, or '*' for any
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | `<cwd>/public` | Directory this devframe manages. |
| `write` | `true` | Enable upload, rename, delete, and folder creation from the UI. |
| `uploadExtensions` | Nuxt DevTools' allow-list | Extensions `upload` accepts, or `'*'` for any. |
| `build` | `false` | Register the `build` CLI subcommand. See [why it's off by default](#static-export) below. |

## RPC surface

All functions are namespaced `devframes:plugin:assets:*`:

| Function | Type | Notes |
|----------|------|-------|
| `list` | `query`, `snapshot: true` | Every file under the managed directory, with type, size, and last-modified time. |
| `capabilities` | `query`, `snapshot: true` | Whether write actions are enabled, and the upload allow-list — lets the UI gate itself proactively. |
| `read-image-meta` | `query` | Width, height, and orientation for an image asset. |
| `read-text` | `query` | Truncated text content, for preview or editing. |
| `upload` | `action` | Allocates a streaming upload slot; the client pipes the file's bytes over the paired channel. |
| `rename` | `action` | Renames an asset within its folder, preserving its extension. |
| `delete` | `action` | Deletes one or more assets in a single call. |
| `mkdir` | `action` | Creates a folder, including missing parents. |
| `write-text` | `action` | Overwrites a text asset's content in place (the details panel's inline editor). |
| `open-in-editor` / `reveal-in-folder` | `action` | Launch the asset in your editor, or reveal its containing folder in the OS file manager. Always registered, regardless of `write`. |

`upload` / `rename` / `delete` / `mkdir` / `write-text` are registered only when `write` is enabled.

## Static export

Every devframe's `build` CLI subcommand is disabled here by default (`capabilities: { build: false }`). Real byte serving for previews goes through `ctx.views.hostStatic()`, which only mounts real files under a live adapter (`cli` / `vite` / `embedded`) — a static export can never copy those bytes, and every write action is inherently excluded from a static dump. Rather than ship a broken, preview-less, write-less shell of the tool, the `build` command is simply not registered. Pass `{ build: true }` to `createAssetsDevframe()` (and `{ force: true }` if calling `createBuild()` directly) if that degraded export is still useful to you — the file listing itself still bakes into the static RPC dump.

## Source

[`plugins/assets`](https://github.com/devframes/devframe/tree/main/plugins/assets)
