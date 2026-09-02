# @devframes/plugin-messages

> [!WARNING] Experimental
> This devframe is experimental and may change without a major version bump until
> it stabilizes.

A built-in devframe that surfaces the hub message feed (`ctx.messages`) as a
portable panel: browse diagnostics and notifications from every mounted tool,
filter by level / source / category / label, inspect stack traces, element and
file positions, and jump to the offending file in your editor.

Ported from the built-in Messages view of
[`vitejs/devtools`](https://github.com/vitejs/devtools); rebuilt on devframe's
framework-neutral client (`connectDevframe`) with a Vue + Vite SPA, reading the
feed through `@devframes/hub`'s `listSince` delta API.

## Mount into a hub

```ts
import createMessagesDevframe from '@devframes/plugin-messages'

await hubContext.install(createMessagesDevframe())
```

The hub's `ctx.messages` feeds the panel live - every
`ctx.messages.add(...)` from any mounted tool shows up, updates stream over
the `devframe:messages:updated` broadcast, and dismissals write back through
the devframe's namespaced RPCs. On a plain (non-hub) context the devframe warns
(`DP_MESSAGES_0001`) and serves an empty feed.

## Embed the panel directly

```ts
import { mountMessages } from '@devframes/plugin-messages/client'

const handle = await mountMessages(document.querySelector('#panel')!, {
  rpc, // optional - reuse the host page's client
})
```

## Standalone

```bash
pnpx @devframes/plugin-messages
```

`pnpm dev` in this package self-hosts the SPA against a demo-seeded messages
feed, so the feed is lively without a full hub.
