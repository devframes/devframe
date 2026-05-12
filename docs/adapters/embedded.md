---
outline: deep
---

# Embedded

Register a devframe into an already-running context at runtime. Mirrors the [`vite`](./vite) adapter's plugin-scan, but for callers that need dynamic, post-startup registration. The host decides the mount path; `embedded` is a hosted adapter and inherits the `/__<id>/` default when one is needed.

```ts
import { createEmbedded } from 'devframe/adapters/embedded'
import devframe from './devframe'

await createEmbedded(devframe, { ctx: existingCtx })
```

| Option | Required | Description |
|--------|----------|-------------|
| `ctx` | ✓ | Target `DevToolsNodeContext` the devframe is registered into. |

Useful when a host loads devframes based on runtime conditions (feature flags, user opt-in, dynamic discovery) rather than static config.
