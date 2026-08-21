---
outline: deep
---

# Assets

Browse, preview, upload, rename, and delete files in a directory — a **Vue** SPA on `@antfu/design`, porting Nuxt DevTools' Assets tab.

Package: `@devframes/plugin-assets` · framework: **Vue + @antfu/design**

<figure class="screenshot">
  <img src="/screenshots/plugin-assets-1.png" alt="Assets plugin screenshot" />
  <figcaption>File browser and details panel</figcaption>
</figure>

## What it does

Search by name, filter by type, view as a thumbnail grid or file tree, and open a details panel: live preview (image, video, audio, font, text), metadata, and copy-ready snippets (`<img>`, `background-image`, `@font-face`, download). Upload via toolbar or drag-and-drop; multi-select to delete. A watcher keeps listings in sync.

The standalone server requires devframe's trust handshake (it reads, writes, deletes real files). Write is on by default — pass `{ write: false }` (or `--read-only`) for browse-only.

## Standalone

```sh
pnpx @devframes/plugin-assets             # manages <cwd>/public
pnpx @devframes/plugin-assets --read-only # disable upload / rename / delete / mkdir
```

## Mount into a Vite host

For a [Vite DevTools](https://devtools.vite.dev) app:

```ts
// vite.config.ts
import createAssetsDevframe from '@devframes/plugin-assets'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    createPluginFromDevframe(createAssetsDevframe()),
  ],
})
```

Or swap in `devframeVite` from `@devframes/vite/single`.

## Programmatic

`createAssetsDevframe(options)` returns a definition for any adapter:

```ts
import { createAssetsDevframe } from '@devframes/plugin-assets'

export default createAssetsDevframe({
  dir: 'static',
  baseURL: '/',
  write: true,
  uploadExtensions: ['png', 'jpg', 'svg', 'webp'], // or '*' for any
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | `<cwd>/public` | Directory to manage. |
| `baseURL` | `/` | URL base the host serves `dir` at (e.g. Nuxt's `app.baseURL`). |
| `write` | `true` | Enable upload, rename, delete, mkdir. |
| `uploadExtensions` | Nuxt DevTools' allow-list | Extensions `upload` accepts, or `'*'` for any. |
| `serveStatic` | `false` | Serve the directory's bytes; off when the host serves `public/`, on for the standalone CLI. |
| `build` | `false` | Register the `build` subcommand (see [Static export](#static-export)). |

## How previews are served

Previews load by **public URL** (`baseURL` + path); the plugin serves bytes only with `serveStatic`.

## RPC surface

Namespaced `devframes:plugin:assets:*`:

| Function | Type | Notes |
|----------|------|-------|
| `list` | `query`, `snapshot: true` | Every file: type, size, mtime. |
| `capabilities` | `query`, `snapshot: true` | Whether write is enabled; the allow-list. |
| `read-image-meta` | `query` | Width/height/orientation. |
| `read-text` | `query` | Truncated text for preview; server-highlighted via [`@devframes/service-shiki`](/guide/services#built-in-services) if available, else plain `<pre>`. |
| `upload` | `action` | Streaming upload slot; the client pipes the bytes. |
| `rename` | `action` | Renames an asset (keeps extension). |
| `delete` | `action` | Deletes one or more assets. |
| `mkdir` | `action` | Creates a folder (and parents). |
| `open-in-editor` / `reveal-in-folder` | `action` | Open in your editor or reveal the folder, via [`@devframes/service-open`](/guide/services#built-in-services). Always registered. |

`upload` / `rename` / `delete` / `mkdir` register only with `write`.

## Static export

The `build` subcommand is disabled by default (`capabilities: { build: false }`) — a static export has no live host or write actions. Pass `{ build: true }` (or `{ force: true }` to `createBuild()`) to bake the file listing anyway.

## Source

[`plugins/assets`](https://github.com/devframes/devframe/tree/main/plugins/assets)
