---
outline: deep
---

# Utilities

Devframe ships small, stable helpers under `devframe/utils/*` — bundled in, no `npm install`.

## Reference

### `devframe/utils/colors`

Terminal ANSI colors, callable as a function or tagged template.

```ts
import { colors as c } from 'devframe/utils/colors'

console.log(c.green('Server ready'))
console.log(c.cyan`listening on port ${port}`)
console.log(`${c.bold(c.red('fatal:'))} something went wrong`)
```

Exports `colors` (`blue`, `cyan`, `gray`, `green`, `red`, `yellow`, `bold`, `dim`, `reset`, `underline`).

### `devframe/utils/open`

Open a URL, file, or target in the OS handler.

```ts
import { open } from 'devframe/utils/open'

await open('https://localhost:7777')
await open('./report.html', { wait: true })
```

### `devframe/utils/launch-editor`

Open a file in the user's editor. Target accepts `file`, `file:line`, or `file:line:column`; an editor command (e.g. `'code'`) overrides auto-detection.

```ts
import { launchEditor } from 'devframe/utils/launch-editor'

launchEditor('src/main.ts:42:7')
launchEditor('src/main.ts:42:7', 'code')
```

Auto-detection reads `LAUNCH_EDITOR`, else defaults. Most use the `openInEditor` recipe ([Common RPC Functions](./common-rpc-functions)).

### `devframe/utils/hash`

Deterministic hash of any structured-cloneable value (cache keys, dedup).

```ts
import { hash } from 'devframe/utils/hash'

const key = hash({ functionName, args })
```

### `devframe/utils/structured-clone`

JSON-safe structured-clone serialization — round-trips `Map`, `Set`, `Date`, `BigInt`, cycles, and class instances.

```ts
import {
  structuredCloneDeserialize,
  structuredCloneParse,
  structuredCloneSerialize,
  structuredCloneStringify,
} from 'devframe/utils/structured-clone'

const wire = structuredCloneStringify(new Map([['a', 1]]))
const value = structuredCloneParse<Map<string, number>>(wire)
```

### `devframe/utils/nanoid`

Tiny URL-safe random ID generator (vendored, zero-dep).

```ts
import { nanoid } from 'devframe/utils/nanoid'

nanoid() // 21 chars
nanoid(10) // 10 chars
```

### `devframe/utils/crypto-token`

Cryptographically-secure token helpers on WebCrypto (browser + Node) — for bearer credentials and one-time codes.

```ts
import { randomDigits, randomToken, timingSafeEqual } from 'devframe/utils/crypto-token'

randomToken() // 32-char hex, 128 bits of entropy — use as a bearer token
randomDigits(6) // '047204' — uniform, leading zeros preserved
timingSafeEqual(input, secret) // constant-time string comparison
```

### `devframe/utils/events`

Generic typed event emitter — `on(event, cb)` returns an unsubscribe function.

```ts
import { createEventEmitter } from 'devframe/utils/events'

const events = createEventEmitter<{ change: (n: number) => void }>()
const off = events.on('change', n => console.log(n))
events.emit('change', 42)
off()
```

### `devframe/utils/shared-state`

The immutable state container behind `ctx.rpc.sharedState` (see [Shared State](/guide/shared-state)); usable directly outside the host.

```ts
import { createSharedState } from 'devframe/utils/shared-state'

const state = createSharedState({ initialValue: { count: 0 } })
state.mutate((draft) => {
  draft.count += 1
})
state.value() // { count: 1 }
```

### `devframe/utils/streaming-channel`

Low-level sink/reader primitives for streamed RPC payloads, via `ctx.rpc.streaming` — see [Streaming](/guide/streaming).

### `devframe/utils/when`

Statically-validated when-clause expressions for conditional UI visibility; runtime + types ship here, consumer `when` fields are kit-side — see [When Clauses](/guide/when-clauses).

## Why a `utils/*` subpath

The utilities are **stable wrappers**, not bare re-exports: consumers install nothing extra (no version drift), and devframe can swap implementations without breaking dependents.
