---
title: 'Services'
navigation:
  icon: i-lucide-share-2
description: 'Built-in wire services (@devframes/service-*): one node-side capability installed once per host and consumed by every devframe and RPC client, without re-implementing or re-bundling it.'
---

Built-in [wire services](/guide/services#wire-services) (`@devframes/service-*`) — one node-side capability installed once per host and consumed by every devframe and RPC client, without re-implementing or re-bundling it. See [Cross-Devframe Services](/guide/services) for the mechanism and the [Services reference](/references/services) for the host API.

| Service | Scope | RPC functions | What it does |
|---------|-------|---------------|--------------|
| [Open](/add-ons/services/open) | `devframes:service:open` | `open-in-editor`, `open-in-finder` | Open files in an editor or reveal them in the OS explorer, refusing paths outside the workspace. |
| [Git](/add-ons/services/git) | `devframes:service:git` | `status`, `log`, `show`, `readFile`, `diff`, `branches`, `tags`, `stage`, `unstage`, `commit` | Typed read/write git operations over RPC on one repo. |
| [Shiki](/add-ons/services/shiki) | `devframes:service:shiki` | `highlight`, `code-to-hast`, `code-to-tokens` | Node-side [Shiki](https://shiki.style) syntax highlighting, LRU-cached and dual-theme. |

## Installing a service

Services are **declarative** — a devframe lists what it consumes on its definition; a hub lists shared ones on `initHub`:

```ts
defineDevframe({
  importMetaUrl: import.meta.url, // resolution base for the declared packages
  services: [
    { package: '@devframes/service-open' },
    { package: '@devframes/service-shiki', version: '^1', options: { langs: ['vue'] } },
  ],
})
```

The host constructs each declared service **once**, before any `setup(ctx)` runs, so setup consumes it synchronously via `ctx.services.get(pkg)`. On the RPC client, feature-detect with `rpc.services.has(pkg)`.
