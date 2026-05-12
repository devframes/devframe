---
outline: deep
---

# Build

Produces a self-contained static deploy of a devframe:

1. Copies the author's SPA dist (`cli.distDir` or `options.distDir`) into `<outDir>`.
2. Runs `setup(ctx)` with `mode: 'build'`.
3. Collects RPC dumps for every `'static'` function and any `'query'` function with `dump.inputs` / `snapshot: true`.
4. Writes `<outDir>/__connection.json` (`{ backend: 'static' }`) and sharded dump files under `<outDir>/__rpc-dump/` — both at the SPA root so the deployed client discovers them via relative paths from `document.baseURI`.
5. When `def.spa` is set, also writes `<outDir>/spa-loader.json` describing how the SPA hydrates its data.

```ts
import { createBuild } from 'devframe/adapters/build'
import devframe from './devframe'

await createBuild(devframe, {
  outDir: 'dist-static',
  base: '/',
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `outDir` | `dist-static` | Output directory. Cleared on each build. |
| `base` | `/` | Absolute URL base the output is served from. |
| `distDir` | `def.cli?.distDir` | Override the SPA dist directory. |

The resulting directory hosts on any static web server (`serve`, nginx, GitHub Pages, …). The client auto-detects `static` mode by resolving `./__connection.json` against `document.baseURI` and runs in read-only form.

`createBuild` copies the SPA verbatim, so deploying under a custom URL base just means building the SPA with relative asset paths (`vite.base: './'`) — the client discovers the effective base at runtime.

When `def.spa` is set on the definition, `createBuild` also writes `spa-loader.json` next to `index.html` describing how the deployed SPA sources its data:

- `'none'` — use the baked RPC dump only (read-only static view).
- `'query'` — hydrate from URL search params.
- `'upload'` — accept a drag-and-drop file.

Deployed SPAs that use `setupBrowser` ship their own client entry that registers the handlers.
