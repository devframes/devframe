---
outline: deep
---

# streaming-chat

A **Preact** demo of devframe's [streaming-channel API](/guide/streaming) combined with [shared state](/guide/shared-state) for persistent chat history. The server emits synthesized "tokens" one at a time over a streaming channel, while the conversation log lives in shared state so it survives reloads, syncs across panels, and replays cleanly when a client re-joins mid-stream.

Package: `streaming-chat-example` · framework: **Preact + Vite**

## What it shows

- A scoped context (`ctx.scope('devframe-streaming-chat')`) auto-namespaces every id.
- `my.rpc.streaming.create('tokens', …)` registers a streaming channel for low-latency token rendering.
- `my.rpc.sharedState('history', …)` keeps the message log on the server; each `send` appends a user + assistant pair atomically.
- The producer streams tokens live, then commits the joined content back to shared state when done — so refreshes and new clients see the finished message immediately.
- `reader.cancel()` aborts mid-stream; the assistant message is marked cancelled with whatever content accumulated.
- `replayWindow` lets a panel reopened mid-stream replay buffered tokens before resuming live.

To wire it to a real LLM, replace the fake token generator in `src/devframe.ts` with anything that yields strings — the stream's `signal` propagates cancellation from the browser all the way to the upstream request.

## Run it

```sh
pnpm -C examples/streaming-chat run build
pnpm -C examples/streaming-chat run dev
```

Open the printed URL, type a prompt, watch tokens stream in, refresh mid-conversation, and cancel a long answer.

## Source

[`examples/streaming-chat`](https://github.com/devframes/devframe/tree/main/examples/streaming-chat)
