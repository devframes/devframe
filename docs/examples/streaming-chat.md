---
outline: deep
---

# streaming-chat

A **Preact** demo of devframe's [streaming-channel API](/guide/streaming) + [shared state](/guide/shared-state): chat history surviving reloads, syncing across panels, replaying mid-stream.

Package: `streaming-chat-example` · framework: **Preact + Vite**

## What it shows

- `ctx.scope('example:streaming-chat')` auto-namespaces every id.
- `my.rpc.streaming.create('tokens', …)` registers a channel.
- `my.rpc.sharedState('history', …)` keeps the log server-side; each `send` appends a user + assistant pair atomically.
- The producer streams tokens live, then commits joined content to state.
- `reader.cancel()` aborts mid-stream; the message is marked cancelled with content so far.
- `replayWindow` replays buffered tokens for a panel reopened mid-stream.

To wire a real LLM, replace the fake generator in `src/devframe.ts`; `signal` propagates cancellation upstream.

## Run it

```sh
pnpm -C examples/streaming-chat run build
pnpm -C examples/streaming-chat run dev
```

Open the printed URL and type a prompt.

## Source

[`examples/streaming-chat`](https://github.com/devframes/devframe/tree/main/examples/streaming-chat)
