---
outline: deep
---

# Build

Produces a self-contained static deploy of a devframe:

1. Copies the author's SPA dist (`cli.distDir` or `options.distDir`) into `<outDir>`.
2. Runs `setup(ctx)` with `mode: 'build'`.
3. Collects RPC dumps for every `'static'` function and any `'query'` function with `dump.inputs` / `snapshot: true`.
4. Writes `<outDir>/__connection.json` (`{ backend: 'static' }`) and sharded dump files under `<outDir>/__rpc-dump/` — both at the SPA root so the deployed client discovers them via relative paths from `document.baseURI`.

```ts
import { createBuild } from 'devframe/adapters/build'
import devframe from './devframe'

await createBuild(devframe, {
  outDir: 'dist-static',
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `outDir` | `dist-static` | Output directory. Cleared on each build. |
| `distDir` | `def.cli?.distDir` | Override the SPA dist directory. |
| `pretty` | `false` | Pretty-print dump JSON (larger on disk). |

The resulting directory hosts on any static web server (`serve`, nginx, GitHub Pages, …). The client auto-detects `static` mode by resolving `./__connection.json` against `document.baseURI` and runs in read-only form.

`createBuild` copies the SPA verbatim, so deploying under a custom URL base just means building the SPA with relative asset paths (`vite.base: './'`) — the client discovers the effective base at runtime.
