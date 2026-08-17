---
outline: deep
---

# Client Assets

A devframe's UI is a built single-page app served as its client. `cli.distDir` tells devframe where those assets live — either a **local directory** bundled with your tool, or a **published npm package** fetched on demand.

## Mounting a local build

The basic form points `cli.distDir` at the directory your SPA build produces. Resolve it from the module so it works from both source and the published package:

```ts
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

export default defineDevframe({
  id: 'my-tool',
  version: pkg.version,
  packageName: pkg.name,
  cli: {
    distDir: fileURLToPath(new URL('../dist/spa', import.meta.url)),
  },
  setup(ctx) {
    // …
  },
})
```

devframe serves that directory with SPA fallback (an unknown path resolves to `index.html`, so client-side routing works) and no-store caching for dev. Build your SPA with a relative base (`vite: { base: './' }`) so the bundle is mount-path portable — it discovers its runtime base from `document.baseURI` and works at `/`, `/__my-tool/`, or any mount point without rewriting.

The [`dev`](/adapters/dev), [`build`](/adapters/build), and [Vite](/frameworks/vite) adapters all consume this same `distDir`.

## Remote assets

Instead of a directory, `cli.distDir` can name a **published npm package** that holds the built UI. The assets are then fetched on demand and cached locally, so the node package doesn't bundle its SPA — keeping the installed footprint small, since a plugin's UI is usually the bulk of its tarball.

Give `cli.distDir` a `RemoteAssets` object naming the package and exact version:

```ts
import type { RemoteAssets } from 'devframe'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

const distDir: RemoteAssets = {
  package: '@acme/my-tool-assets',
  version: pkg.version,
  resolveFrom: import.meta.url,
}

export default defineDevframe({
  id: 'my-tool',
  version: pkg.version,
  packageName: pkg.name,
  cli: { distDir },
  setup(ctx) {
    // …
  },
})
```

The UI mounts as usual — the first request for each file is streamed from a CDN and written to a local cache; subsequent requests are served from disk.

### How assets resolve

For each request the source resolves in order:

1. **Locally installed package** — resolved from `resolveFrom` (`import.meta.url`). If `@acme/my-tool-assets` is installed next to your tool, it's served directly with no network. This is the offline path.
2. **On-disk cache** — files already fetched, under the project's storage directory.
3. **CDN back-proxy** — [jsDelivr](https://www.jsdelivr.com/) by default, mirroring npm. Each file streams to the browser and is cached on the way past.

Exact-version URLs are immutable, so a cached file never goes stale.

### Options

| Field | Purpose |
|-------|---------|
| `package` | npm package holding the built assets. |
| `version` | Exact version to serve — usually your tool's own `pkg.version`. |
| `resolveFrom` | `import.meta.url` of the declaring module; enables the zero-network path from a locally installed copy. Omit to skip straight to cache + CDN. |
| `path` | Subpath inside the package the assets live under. Defaults to `dist`. |
| `provider` | `'jsdelivr'` (default), `'unpkg'`, or a custom provider for an internal mirror. |
| `offline` | `true` serves only from a local install or the cache — never the network. |

`package` and `version` are interpolated into the CDN URL and cache path, so they're validated: an invalid npm name or non-exact version throws [`DF0065`](../errors/DF0065).

### Offline and air-gapped use

Remote assets are a convenience, not a hard network dependency. To run with no network, install the assets package explicitly — resolution step 1 then serves it locally:

```sh
npm install @acme/my-tool-assets
```

Set `offline: true` to guarantee the CDN is never contacted, or point `provider` at an internal npm mirror.

### Custom provider

A custom provider supplies the file URL, and optionally a file listing (used for correct 404s, SPA fallback, and static builds):

```ts
const distDir: RemoteAssets = {
  package: '@acme/my-tool-assets',
  version: pkg.version,
  resolveFrom: import.meta.url,
  provider: {
    fileUrl: (name, version, file) =>
      `https://npm.internal.acme.com/${name}@${version}/${file}`,
  },
}
```

### Publishing the assets

The assets package is an ordinary npm package that ships the built UI under `path` (default `dist`) and exposes its `package.json` so `resolveFrom` can locate it:

```json
{
  "name": "@acme/my-tool-assets",
  "version": "1.0.0",
  "exports": { "./package.json": "./package.json" },
  "files": ["dist"]
}
```

Keep its version in lockstep with the tool that declares it, so `version: pkg.version` always points at matching UI.
