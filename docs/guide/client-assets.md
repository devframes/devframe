---
outline: deep
---

# Client Assets

A devframe's UI is a built single-page app served as its client. The top-level `clientAssets` field tells devframe where those assets live — either a **local directory** bundled with your tool, or a **published npm package** fetched on demand.

## Mounting a local build

The basic form points `clientAssets` at the directory your SPA build produces. Resolve it from the module so it works from both source and the published package:

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

devframe serves that directory with SPA fallback (an unknown path resolves to `index.html`, so client-side routing works) and no-store caching for dev. Build your SPA with a relative base (`vite: { base: './' }`) so the bundle is mount-path portable — it discovers its runtime base from `document.baseURI` and works at `/`, `/__my-tool/`, or any mount point without rewriting.

The [`dev`](/adapters/dev), [`build`](/adapters/build), and [Vite](/frameworks/vite) adapters all consume this same `clientAssets`.

The earlier home for this value, `cli.distDir`, is deprecated but still read as a fallback when `clientAssets` is unset, so existing definitions keep working — move it up to the top level at your convenience.

## Programmatic hosting from `setup`

`clientAssets` is the declarative way to serve the tool's *primary* UI — the adapters resolve it and mount it at the base path for you. When you need to host assets yourself — mount a second static bundle at another path, decide the source at runtime, or serve extra directories alongside the main SPA — reach for `ctx.views.hostStatic` inside `setup`:

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

`hostStatic(baseUrl, source, defaultResolveFrom?)` accepts the same `StaticAssetsSource` (a local directory or a remote declaration) as `clientAssets`. In `dev` mode it registers the middleware live; in `build` mode it copies the files into the static output, so a programmatically hosted bundle survives `createBuild` too. The optional `defaultResolveFrom` overrides the context's own `importMetaUrl` as the resolution base for a remote source — a hub mounting assets on behalf of a plugin passes that plugin's `importMetaUrl` so they resolve against its dependency graph.

Under the hood the adapters resolve `clientAssets` (falling back to the deprecated `cli.distDir`) with the exported `resolveClientAssets(def)` helper and hand it to the host's static mount — `hostStatic` is that same mechanism, exposed for your own bases.

## Remote assets

Instead of a directory, `clientAssets` can name a **published npm package** that holds the built UI. The assets are then fetched on demand and cached locally, so the node package doesn't bundle its SPA — keeping the installed footprint small, since a plugin's UI is usually the bulk of its tarball.

Give `clientAssets` a `RemoteAssets` object naming the package and exact version:

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

The UI mounts as usual — the first request for each file is streamed from a CDN and written to a local cache; subsequent requests are served from disk.

The definition's [`importMetaUrl`](./devframe-definition#resolving-against-the-plugins-own-dependencies) supplies the resolution base, so a remote source needs only its `package` and `version`. A per-source `resolveFrom` overrides that base for one source, and an explicit `resolveFrom: null` opts a source out of the installed-copy lookup entirely.

### How assets resolve

For each request the source resolves in order:

1. **Locally installed package** — resolved from `resolveFrom`, which defaults to the definition's `importMetaUrl`. If `@acme/my-tool-assets` is installed next to your tool, it's served directly with no network. This is the offline path.
2. **On-disk cache** — files already fetched, under the project's storage directory.
3. **CDN back-proxy** — [jsDelivr](https://www.jsdelivr.com/) by default, mirroring npm. Each file streams to the browser and is cached on the way past.

Exact-version URLs are immutable, so a cached file never goes stale.

### Options

| Field | Purpose |
|-------|---------|
| `package` | npm package holding the built assets. |
| `version` | Exact version to serve — usually your tool's own `pkg.version`. |
| `resolveFrom` | Resolution base for the zero-network path from a locally installed copy. Defaults to the definition's `importMetaUrl`; set it to override that for one source, or to `null` to skip straight to cache + CDN. |
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

### When the assets can't be reached

A file that is in neither a local install nor the cache, with the provider unreachable, raises [`DF0060`](../errors/DF0060). An HTML navigation gets a self-contained page naming the assets package, the install command that makes it work offline, and the provider's own error, with a retry button.

That page also posts its failure to `window.parent` (`DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE` from `devframe/constants`, payload `RemoteAssetsErrorMessage`), so a viewer embedding the tool in an iframe can render the same thing in its own design — `@devframes/hub-ui` shows it as a panel over the dock's frame ([building your own](./build-your-own-hub-ui)).

### Custom provider

A custom provider supplies the file URL, and optionally a file listing (used for correct 404s, SPA fallback, and static builds):

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

The assets package is an ordinary npm package that ships the built UI under `path` (default `dist`) and exposes its `package.json` so the resolver can locate it:

```json
{
  "name": "@acme/my-tool-assets",
  "version": "1.0.0",
  "exports": { "./package.json": "./package.json" },
  "files": ["dist"]
}
```

Keep its version in lockstep with the tool that declares it, so `version: pkg.version` always points at matching UI.
