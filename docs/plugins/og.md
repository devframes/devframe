---
outline: deep
---

# Open Graph Viewer

Inspect a page's resolved Open Graph and Twitter metadata and compare its social cards across common platforms.

## Run Standalone

```sh
npx @devframes/plugin-og
```

Enter any HTTP or HTTPS page reachable from the devframe process. The viewer resolves relative image and icon URLs against the fetched document and identifies missing metadata with a ready-to-use Nuxt `useSeoMeta()` snippet.

## Create A Definition

```ts
import { createOgDevframe } from '@devframes/plugin-og'

export default createOgDevframe({
  defaultUrl: 'http://localhost:3000/about',
})
```

`defaultUrl` supplies the initial target and makes `devframe build` bake that page into the static RPC dump. The resulting report keeps its assets relative and runs from any deployment path.

The standalone server requires devframe's trust handshake by default because it can request developer-supplied URLs. Set `auth: false` only for an isolated local environment.
