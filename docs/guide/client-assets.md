---
outline: deep
---

# Client Assets

A devframe's UI is a built SPA. The top-level `clientAssets` field says where those assets live — a **local directory** bundled with your tool, or a **published npm package** fetched on demand.

## Mounting a local build

Point `clientAssets` at your SPA build directory, resolved from the module (works from source and the published package):

```ts
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

export default defineDevframe({
  id: 'my-tool',
  version: pkg.version,
  packageName: pkg.name,
  clientAssets: fileURLToPath(new URL('../dist/spa', import.meta.url)),
  setup(ctx) {
    // …
  },
})
```

devframe serves it with SPA fallback (unknown paths → `index.html`) and no-store dev caching. Build the SPA with a relative base (`vite: { base: './' }`) so it reads its runtime base from `document.baseURI`.

The [`dev`](/adapters/dev), [`build`](/adapters/build), and [Vite](/frameworks/vite) adapters consume this same `clientAssets`. The earlier `cli.distDir` is deprecated but still read as a fallback when `clientAssets` is unset.

## Programmatic hosting from `setup`

`clientAssets` serves the *primary* UI. To host assets yourself — a second bundle, a runtime-decided source, extra directories — use `ctx.views.hostStatic` in `setup`:

```ts
export default defineDevframe({
  id: 'my-tool',
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url,
  clientAssets: fileURLToPath(new URL('../dist/spa', import.meta.url)),
  setup(ctx) {
    // Serve an extra static bundle at a sibling base.
    ctx.views.hostStatic(
      '/docs/',
      fileURLToPath(new URL('../dist/docs', import.meta.url)),
    )

    // A remote source works here too — same shape as `clientAssets`.
    ctx.views.hostStatic('/legacy/', {
      package: '@acme/my-tool-legacy-ui',
      version: pkg.version,
    })
  },
})
```

`hostStatic(baseUrl, source, defaultResolveFrom?)` accepts the same `StaticAssetsSource` as `clientAssets`; in `dev` it registers middleware live, in `build` it copies files into the static output.

## Remote assets

Instead of a directory, give `clientAssets` a `RemoteAssets` object naming a **published npm package** and exact version — fetched on demand and cached locally, so the node package doesn't bundle its SPA:

```ts
import type { RemoteAssets } from 'devframe'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

const clientAssets: RemoteAssets = {
  package: '@acme/my-tool-assets',
  version: pkg.version,
}

export default defineDevframe({
  id: 'my-tool',
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url,
  clientAssets,
  setup(ctx) {
    // …
  },
})
```

The definition's [`importMetaUrl`](./devframe-definition#resolving-against-the-plugins-own-dependencies) supplies the resolution base.

### How assets resolve

Per request, the source resolves in order:

1. **Locally installed package** — resolved from `resolveFrom` (default `importMetaUrl`); served directly, no network.
2. **On-disk cache** — files already fetched, under the project's storage directory.
3. **CDN back-proxy** — [jsDelivr](https://www.jsdelivr.com/) by default; each file streams to the browser, cached in passing. Exact-version URLs are immutable, so cached files never go stale.

### Options

| Field | Purpose |
|-------|---------|
| `package` | npm package holding the built assets. |
| `version` | Exact version, usually your tool's `pkg.version`. |
| `resolveFrom` | Resolution base for the local path. Defaults to `importMetaUrl`; `null` skips to cache + CDN. |
| `path` | Subpath the assets live under (default `dist`). |
| `provider` | `'jsdelivr'` (default), `'unpkg'`, or a custom provider for an internal mirror. |
| `offline` | `true` serves only from a local install or cache, never the network. |

An invalid npm name or non-exact version throws [`DF0065`](../errors/DF0065).

### Offline and air-gapped use

Install the assets package explicitly; resolution step 1 serves it locally:

```sh
npm install @acme/my-tool-assets
```

Set `offline: true` to never contact the CDN, or point `provider` at an npm mirror.

### When the assets can't be reached

A file absent from local install and cache, with the provider unreachable, raises [`DF0060`](../errors/DF0060). An HTML navigation gets a self-contained page with the package, install command, provider error, and retry button.

It also posts the failure to `window.parent` (`DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE` from `devframe/constants`, payload `RemoteAssetsErrorMessage`), so an embedding viewer renders it itself ([`@devframes/hub-ui`](./build-your-own-hub-ui) shows a panel over the dock frame).

### Custom provider

A custom provider supplies the file URL, optionally a file listing (404s, SPA fallback, static builds):

```ts
const clientAssets: RemoteAssets = {
  package: '@acme/my-tool-assets',
  version: pkg.version,
  provider: {
    fileUrl: (name, version, file) =>
      `https://npm.internal.acme.com/${name}@${version}/${file}`,
  },
}
```

### Publishing the assets

An ordinary npm package ships the built UI under `path` (default `dist`), exposing its `package.json` so the resolver finds it:

```json
{
  "name": "@acme/my-tool-assets",
  "version": "1.0.0",
  "exports": { "./package.json": "./package.json" },
  "files": ["dist"]
}
```

Keep its version in lockstep with the tool, so `version: pkg.version` matches the UI.
