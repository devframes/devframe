---
outline: deep
---

# Embedded

Register a devframe into an already-running context at runtime — dynamic, post-startup registration (unlike [`vite`](./vite)'s plugin-scan). Inherits the hosted `/__<id>/` default.

```ts
import { createEmbedded } from 'devframe/adapters/embedded'
import devframe from './devframe'

await createEmbedded(devframe, { ctx: existingCtx })
```

| Option | Required | Description |
|--------|----------|-------------|
| `ctx` | ✓ | Target `DevframeNodeContext` to register into. |
