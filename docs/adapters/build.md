---
outline: deep
---

# Build

Produces a static deploy:

1. Copies the SPA dist into `<outDir>`.
2. Runs `setup(ctx)` with `mode: 'build'`.
3. Collects RPC dumps for every `'static'` and `'query'` with `dump.inputs` / `snapshot: true`.
4. Writes `__connection.json` (`{ backend: 'static' }`) and sharded dumps under `__rpc-dump/`.

```ts
import { createBuild } from 'devframe/adapters/build'
import devframe from './devframe'

await createBuild(devframe, {
  outDir: 'dist-static',
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `outDir` | `dist-static` | Output directory (cleared). |
| `distDir` | `def.clientAssets` | SPA dist override (or [remote assets](/guide/client-assets)). |
| `pretty` | `false` | Pretty-print dump JSON. |

The client runs read-only. For a custom URL base, build with relative asset paths (`vite.base: './'`).
