---
outline: deep
---

# Streaming

Devframe's streaming channels push chunk-style data server→client over the RPC socket.

## Overview

```mermaid
sequenceDiagram
  participant Producer as Producer (server)
  participant Channel as ctx.rpc.streaming<br/>channel
  participant Browser as Subscriber (browser)

  Producer->>Channel: start({ id })
  Channel-->>Browser: chunk(seq=1, "...")
  Channel-->>Browser: chunk(seq=2, "...")
  Producer->>Channel: close()
  Channel-->>Browser: end()
```

A **channel** owns a wire namespace; each `channel.start()` produces one **stream** keyed by an id (auto-generated unless passed); subscribers join by `(channelName, id)`.

## Defining a channel

In `setup`:

```ts
import { defineDevframe, defineRpcFunction } from 'devframe'
import * as v from 'valibot' // npm i valibot

export default defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  async setup(ctx) {
    const my = ctx.scope('my-devframe')

    const channel = my.rpc.streaming.create<string>('chat', { // -> my-devframe:chat
      replayWindow: 256,
    })

    my.rpc.register(defineRpcFunction({
      name: 'start-chat', // -> my-devframe:start-chat
      type: 'action',
      jsonSerializable: true,
      args: [v.object({ prompt: v.string() })],
      returns: v.object({ streamId: v.string() }),
      handler: async ({ prompt }) => {
        const stream = channel.start()
        ;(async () => {
          for await (const token of fakeLLM(prompt, { signal: stream.signal })) {
            stream.write(token)
          }
          stream.close()
        })()
        return { streamId: stream.id }
      },
    }))
  },
})
```

## Producing — three surfaces, one stream

`channel.start({ id? })`, three ways:

```ts
const stream = channel.start({ id: 'optional-explicit-id' })

// Imperative — minimal, hand-rolled producers
stream.write(chunk)
stream.error(err) // terminal failure
stream.close() // terminal success
stream.signal // AbortSignal — flips when consumers cancel
stream.id // string — what clients subscribe to

// Web Streams — pipe any ReadableStream<T> in:
sourceReadable.pipeTo(stream.writable, { signal: stream.signal })

// Convenience — start + pipe in one call:
const stream = await channel.pipeFrom(sourceReadable)
```

```ts
for (const token of source) {
  if (stream.signal.aborted)
    return
  stream.write(token)
}
stream.close()
```

### Node stream interop

Node 17+ ships converters:

```ts
import { Readable, Writable } from 'node:stream'

// Pipe a Node Readable into the streaming channel
sourceNodeReadable.pipe(Writable.fromWeb(stream.writable))

// Pipe the channel out to a Node Writable
Readable.fromWeb(reader.readable).pipe(targetNodeWritable)
```

## Consuming — `for await` or `pipeTo`

The reader is an `AsyncIterable<T>` that also exposes `.readable` (a `ReadableStream<T>`); use one surface per reader (shared queue).

```ts
import { connectDevframe } from 'devframe/client'

const my = (await connectDevframe()).scope('my-devframe')
const { streamId } = await my.rpc.call('start-chat', {
  prompt: 'Hello',
})

const reader = my.rpc.streaming.subscribe<string>('chat', streamId) // -> my-devframe:chat

// Async iterable — the simplest consumer pattern
for await (const token of reader)
  appendToken(token)

// Or pipe to a DOM-side WritableStream
await reader.readable.pipeTo(downloadWritable)

reader.cancel() // sends cancel upstream; server stream.signal flips
```

## Lifecycle and cancellation

| Event | Server | Client |
|-------|--------|--------|
| `stream.close()` / `stream.error(err)` | Broadcasts `end` | `for await` resolves or throws |
| `reader.cancel()` | aborts `stream.signal` on **last**-subscriber cancel | Reader cancelled; `for await` ends |
| WS disconnects | aborts `stream.signal` on **last**-subscriber drop | Reader stays alive; resubscribes on re-trust |
| `chat` panel closes | Cancel cascades upstream | — |

## Client-to-server uploads

In reverse, an RPC call allocates the id, then events carry chunks.

```ts
// Server — typically inside an action handler
ctx.rpc.register(defineRpcFunction({
  name: 'my-devframe:upload-file',
  type: 'action',
  args: [v.object({ name: v.string() })],
  returns: v.object({ uploadId: v.string() }),
  handler: async ({ name }) => {
    const reader = channel.openInbound()

    // Process chunks asynchronously — the action returns immediately
    // so the client can start uploading.
    ;(async () => {
      const file = createWriteStream(name)
      for await (const chunk of reader)
        file.write(chunk)
      file.close()
    })()

    return { uploadId: reader.id }
  },
}))
```

```ts
// Client
const { uploadId } = await my.rpc.call('upload-file', {
  name: 'capture.bin',
})
const upload = my.rpc.streaming.upload<Uint8Array>('files', uploadId) // -> my-devframe:files

// Imperative
upload.write(chunk1)
upload.write(chunk2)
upload.close()

// Or pipe a Web ReadableStream straight in:
fileReadable.pipeTo(upload.writable, { signal: upload.signal })
```

Lifecycle mirrors outbound:

- `upload.signal` aborts when the server calls `reader.cancel()` (broadcasting `upload-cancel`).
- `upload.error(err)` throws inside the server's `for await`; a client disconnect exits with `UploadDisconnected`.

Each `openInbound()` gives a fresh id; point-to-point: one producer, no fan-in, no replay.

## Replay on reconnect

With `replayWindow: N`, the server keeps the last `N` chunks; on resubscribe the client sends its highest seen sequence and the server replays newer chunks first.

```ts
my.rpc.streaming.create<string>('chat', { // -> my-devframe:chat
  replayWindow: 256, // chunks to retain per stream id
  closedStreamRetention: 30_000, // ms to hold closed streams for late subscribers
})
```

`closedStreamRetention` defaults to 30 s (`replayWindow > 0`).

## Backpressure

The client keeps a bounded queue per subscription (`highWaterMark`, default 256); if the consumer falls behind, the oldest chunk drops, logging [`DF0029`](../errors/DF0029).

```ts
const reader = my.rpc.streaming.subscribe('chat', id, { // -> my-devframe:chat
  highWaterMark: 1024, // raise if you expect bursts the consumer can recover from
})
```

For authoritative state, use [shared state](./shared-state).

## When to use streaming vs events vs shared state

| Streaming | `event`-typed RPC | Shared state |
|-----------|-------------------|--------------|
| Token/chunk feeds (LLM deltas, logs) | Payload-less notifications (`refresh`, `clear`) | Long-lived UI state |
| Per-call lifecycles, cancellation | Cross-cutting broadcast signals | Reactive snapshots surviving reconnect |
| Replay on reconnect | Fire-and-forget signaling | Diff-based sync |
| Client→server uploads (files, mic) | | |

## Reference

- API: `RpcStreamingHost`, `RpcStreamingChannel<T>`, `StreamSink<T>`, `StreamReader<T>` in `devframe/types`.
- Example: [`examples/streaming-chat`](https://github.com/devframes/devframe/tree/main/examples/streaming-chat).
- Errors: [`DF0029`](../errors/DF0029) (overflow), [`DF0030`](../errors/DF0030) (unknown id), [`DF0031`](../errors/DF0031) (write to closed), [`DF0032`](../errors/DF0032) (name collision).
