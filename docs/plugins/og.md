---
outline: deep
---

# Open Graph Viewer

Inspect a page's resolved Open Graph and Twitter metadata and compare its social cards across common platforms, built as a **Vue** SPA.

Package: `@devframes/plugin-og` · framework: **Vue + Vite**

## What it does

Enter any HTTP or HTTPS page reachable from the devframe process. The viewer resolves relative image and icon URLs against the fetched document, renders the resulting social cards for Twitter, Facebook, LinkedIn, and Telegram, and identifies missing metadata with a ready-to-use Nuxt `useSeoMeta()` snippet.

The standalone server requires devframe's trust handshake by default because it can request developer-supplied URLs. Set `auth: false` only for an isolated local environment.

## Standalone

```sh
pnpx @devframes/plugin-og
```

## Mount into a Vite host

```ts
// vite.config.ts
import { ogVitePlugin } from '@devframes/plugin-og/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    ogVitePlugin(),
  ],
})
```

## Programmatic

`createOgDevframe(options)` returns a definition you can deploy through any adapter:

```ts
import { createOgDevframe } from '@devframes/plugin-og'

export default createOgDevframe({
  defaultUrl: 'http://localhost:3000/about',
})
```

`defaultUrl` supplies the initial target and makes `devframe build` bake that page into the static RPC dump. The resulting report keeps its assets relative and runs from any deployment path.

## RPC surface

All functions are namespaced `devframes:plugin:og:*`:

| Function | Type | Returns |
|----------|------|---------|
| `resolve-metadata` | `query` | Fetches an HTTP or HTTPS page and returns its normalized title, language, Open Graph, Twitter, and link metadata. |

## Source

[`plugins/og`](https://github.com/devframes/devframe/tree/main/plugins/og)
