---
outline: deep
---

# Vite

The Vite-DevTools adapter — wraps a `DevframeDefinition` so Vite DevTools' kit plugin-scan picks it up. The factory lives in `@vitejs/devtools-kit/node` so devframe itself stays free of any Vite or `@vitejs/*` dependency. The pattern (`definition → host plugin → mount`) is general; other hosts can implement equivalent bridges.

```ts
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import devframe from './devframe'

export default function myVitePlugin() {
  return createPluginFromDevframe(devframe)
}
```

The returned object has the shape `{ name, devtools: { setup, capabilities } }`. Use this adapter when your devframe should live inside the Vite DevTools dock alongside other integrations. The kit synthesises an iframe dock entry from the definition's `id` / `name` / `icon` / `basePath`; for richer host-side behaviour (extra terminals, commands, dock overrides) pass `options.setup`. See the [DevTools Kit → DevTools Plugin](https://devtools.vite.dev/kit/devtools-plugin) page for the Vite-specific guide.

| Option | Default | Description |
|--------|---------|-------------|
| `name` | `devframe:<id>` | Override the Vite plugin name. |
| `base` | `def.basePath ?? /.${id}/` | Mount path override. |
| `dock` | `{}` | Overrides for the synthesized iframe dock entry (category, icon, when). |
| `setup` | — | Additional host-only setup hook; receives the kit-augmented context (Vite DevTools' `docks`, `terminals`, `messages`, `commands`). |
