---
title: 'References'
navigation:
  icon: i-lucide-book-marked
description: 'Lookup pages the guides link into: the canonical terms, the when-clause contexts, every event name on the wire, the API tables for the node side, the browser side, and the hub, and the helpers, utilities, and services surfaces.'
---

Lookup pages the guides link into:

- [Terms](/references/terms) — the canonical vocabulary of these docs: one name per concept, with its anchoring API.
- [When Clauses](/references/when-clauses) — the contexts and operators that gate docks, commands, and custom UI.
- [Events Reference](/references/events) — every event, broadcast, shared-state key, and channel name, by direction and reach.
- [Node-Side API](/references/node-api) — `DevframeDefinition` fields, CLI options, storage scopes, RPC function types, broadcast options, streaming lifecycle, remote assets, diagnostics prefixes, and the auth surface.
- [Browser-Side API](/references/browser-api) — `connectDevframe` options, RPC client events, connection statuses, and in-page channel error codes.
- [Hub API](/references/hub-api) — hub subsystems, launcher fields, duplication strategies, dock categories, the hub UI protocol, the namespace routes, the client runtime, the client context, and dock entry types.
- [Helpers](/references/helpers) — the optional layer around `defineDevframe`: the [utilities](/references/utilities), the [common RPC functions](/references/common-rpc-functions), and the [interactive auth](/references/interactive-auth) recipe.
- [Services](/references/services) — the `DevframeServicesHost` methods, the wire-service definition and descriptor fields, and the advertised meta shape (the built-in services live under [Add-ons](/add-ons/services)).

The [error reference](/errors) documents each `DF*` diagnostic code, and [migrations](/migrations) each version step. The adapter, framework-kit, helper, and built-in-devframe pages each carry their own package's options and RPC tables.
