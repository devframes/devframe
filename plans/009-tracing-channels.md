# Plan 009: First-class Node.js Tracing Channel support

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before you move on. If a STOP condition occurs, stop and report it. Do not weaken a boundary rule to get past it. Update this plan's row in `plans/README.md` when a PR lands.
>
> **Drift check (run first)**: `git diff --stat cac6900c..HEAD -- packages/devframe/src/node packages/devframe/src/types packages/devframe/src/events.ts packages/devframe/src/adapters packages/hub/src/node/initiate.ts packages/hub/src/node/install-devframe.ts plugins/inspect docs/content/8.references`
> Stop if `ctx.rpc.streaming`, `ctx.rpc.sharedState`, the birpc resolver in `rpc-core.ts`, or the inspect plugin tab shell changed in a way that breaks an anchor below.

## Status

- **Priority**: P2
- **Effort**: L (three PRs, about one executor day each)
- **Risk**: MED
- **Depends on**: none
- **Category**: product
- **Planned at**: commit `cac6900c`, 2026-10-05

## Why this matters

Node.js ships `node:diagnostics_channel` with the `TracingChannel` class. A Tracing Channel is a named group of five channels (`start`, `end`, `asyncStart`, `asyncEnd`, `error`) that libraries publish to around one unit of work. Node itself publishes `tracing:module.require` and `tracing:net.server.listen`. Libraries and user apps publish their own. Today devframe has no way to see any of this. A developer who wants to know what their app traced has to write a subscriber by hand.

This plan gives devframe a small core primitive, `ctx.tracing`, and a Tracing tab in the inspect plugin. A developer picks a channel, presses Record, and sees each traced unit of work as one record with duration, status, context, result and error. In phase 2, devframe traces its own RPC calls and shared-state writes through the same primitive, so external tools (OpenTelemetry, APM agents) can subscribe to devframe with the standard Node API.

## Decisions already made

These were settled with the maintainer. Do not reopen them.

1. The concept keeps the Node name. In prose it is "Tracing Channel". One traced unit of work is a "trace record".
2. The primitive lives in `devframe` core as `ctx.tracing`. The UI lives in the inspect plugin. Core owns every wire piece (shared state, stream, RPC).
3. Subscription is on demand. devframe subscribes to a Node channel only while someone records it, because `hasSubscribers` turns on tracing work in the user app.
4. Known channels come from three sources: `ctx.tracing.register()` calls, a built-in list of Node names, and `tracing.channels` on the devframe definition and on hub options. A name typed in the UI is a fourth, ad-hoc source.
5. The five events are grouped by context identity into one record. A ring buffer keeps 500 records per channel.
6. Node and Bun are supported. When `tracingChannel` is missing (Deno), every method is a no-op and `record()` reports `DF0081` once.
7. The tracing wire pieces are never traced themselves. Every other RPC function and shared-state key is.
8. Phase 2 producers are `devframe:rpc` and `devframe:shared-state`. Streaming is not traced.

## Constraints this plan must not break

- **Headless core**: no `console.*`, no stdout. All reports go through coded `DF` diagnostics (`.agents/08-diagnostics.md`).
- **Event names from the map**: the shared-state key and stream name live in `DEVFRAME_EVENTS` and in `docs/content/8.references/3.events.md`. RPC method ids live in `types/rpc-augments.ts` (`.agents/04-conventions.md`).
- **Runtime-agnostic entries stay clean**: `packages/devframe/src/utils/shared-state.ts` is in `AGNOSTIC_ENTRIES` (`packages/devframe/test/runtime-agnostic.test.ts:11-21`). It must not import `node:diagnostics_channel`. Phase 2 wraps shared state at the node host layer instead.
- **Validator neutral**: no `zod`, `valibot` or `arktype`. Author RPC arg schemas with `devframe/utils/simple-schema`.
- **Design system**: the inspect tab builds on `@antfu/design` components and semantic tokens only (`.agents/06-design-system.md`).
- **No type erasure**: trace payloads are typed as `SerializedValue`, not `unknown`.

## Current state

- `packages/devframe/src/node/rpc-core.ts:93-109`: the birpc `resolver` wraps every handler in `asyncStorage.run({ rpc, meta }, ...)`. `name`, `args`, `rpc` and `meta` are in scope. `meta.id` is the session id.
- `packages/devframe/src/node/context.ts:46-72`: `createHostContext` builds `rpc`, `views`, `diagnostics`, `services` and `agent` on one context object. `packages/devframe/src/node/scope.ts:47-61` copies these fields onto a scoped context.
- `packages/devframe/src/node/rpc-shared-state.ts:49-86`: `host.get(key, { initialValue })` creates a `SharedState` once per key. `packages/devframe/src/node/host-services.ts:313-326` shows how core owns a built-in shared state (`devframe:services`).
- `packages/devframe/src/node/rpc-streaming.ts:220-251`: `create(name)` throws `DF0032` on a duplicate name. `start({ id })` with an id that is already open overwrites the record silently and leaks listeners. The tracing host must close a stream before it starts one with the same id.
- `packages/devframe/src/events.ts:24-76`: groups `bus`, `client`, `broadcast`, `inPageChannel`, `postMessage`. No `sharedState` or `stream` group yet. `packages/hub/src/events.ts` has both.
- `packages/devframe/src/types/devframe.ts:419`: `DevframeDefinition.services`. `packages/hub/src/node/initiate.ts:178`: `InitHubOptions.services`. Both are consumed before `setup()` runs (`adapters/initiate.ts:304-307`, `hub/initiate.ts:464-473`, `hub/install-devframe.ts:154-155`).
- `plugins/inspect/app/App.vue:26-47,113-119`: tabs are a `Tab` union plus an `allTabs` array and a `v-if` chain. `isStatic()` hides the `instances` tab at line 52.
- `plugins/inspect/app/components/StateSmart.vue:63-84` and `StateView.vue:30-74`: the list plus detail split pane with `.split`, `.keys`, `.key-item`, `.state-main` and `JsonView`. This is the template for the Tracing tab.
- Node 24 exposes no API that lists channels. `Object.keys(diagnostics_channel)` is `channel, hasSubscribers, subscribe, tracingChannel, unsubscribe, Channel`.
- Next free core diagnostic code: `DF0081` (`docs/content/6.errors/` ends at `DF0080`).

## Target design

### Types (`packages/devframe/src/types/tracing.ts`, new)

```ts
import type { TracingChannel } from 'node:diagnostics_channel'

export type SerializedValue =
  | string | number | boolean | null
  | SerializedValue[]
  | { [key: string]: SerializedValue }

export type DevframeTracingChannelSource = 'builtin' | 'registered' | 'config' | 'adhoc'

export interface DevframeTracingChannelInfo {
  name: string
  description?: string
  source: DevframeTracingChannelSource
  recording: boolean
  count: number
}

export type DevframeTracePhase = 'start' | 'end' | 'asyncStart' | 'asyncEnd' | 'error'

export interface DevframeTraceEvent { phase: DevframeTracePhase, at: number }

export interface DevframeTraceRecord {
  id: string
  channel: string
  startedAt: number
  duration?: number
  status: 'pending' | 'ok' | 'error'
  context: SerializedValue
  result?: SerializedValue
  error?: { name: string, message: string, stack?: string }
  events: DevframeTraceEvent[]
}

export interface DevframeTracingChannelInput { name: string, description?: string }

export interface DevframeTracingOptions {
  channels?: Array<string | DevframeTracingChannelInput>
}

export interface DevframeTracingHost {
  register: (channel: string | TracingChannel, meta?: { description?: string }) => TracingChannel
  list: () => DevframeTracingChannelInfo[]
  record: (name: string) => void
  stop: (name: string) => void
  records: (name: string) => DevframeTraceRecord[]
  clear: (name: string) => void
  onRecord: (name: string, fn: (record: DevframeTraceRecord) => void) => () => void
}
```

`name` is the Tracing Channel base name, the argument you pass to `tracingChannel(name)`. The Node channel names are `tracing:${name}:start` and so on. When `register()` receives a `TracingChannel` instance, the host reads `channel.start.name` and strips the `tracing:` prefix and the `:start` suffix.

### Host (`packages/devframe/src/node/host-tracing.ts`, new)

- `DevframeTracingHost` class, constructed in `createHostContext` next to `services`, assigned to `context.tracing`. `scope.ts` copies it onto scoped contexts unchanged (no namespace prefix: channel names are global in Node).
- On construction it resolves `node:diagnostics_channel` and feature-detects `typeof tracingChannel === 'function'`. The result is `supported: boolean`.
- `register()` is idempotent. A second call with the same name returns the same channel and only fills in a missing `description`. Source precedence when the same name arrives twice: `registered` > `config` > `builtin` > `adhoc`.
- Built-in names seeded at construction: `module.require` and `net.server.listen`, source `builtin`.
- `record(name)`: if `!supported`, report `DF0081` once per process and return. If the name is unknown, add it with source `adhoc`. If already recording, return. Otherwise `channel.subscribe(handlers)`, start the stream for that name, set `recording: true`.
- `stop(name)`: `channel.unsubscribe(handlers)`, close the stream, set `recording: false`. Records stay in the buffer.
- `clear(name)`: empty the buffer, reset `count`. If recording, close and restart the stream so the replay buffer is empty too.
- `records(name)`: oldest to newest, at most 500.
- Grouping: a `WeakMap<object, DevframeTraceRecord>` maps the shared context object to its record. `start` creates the record with `status: 'pending'`. Every phase appends to `events`, sets `duration = at - startedAt`, and re-serializes `context`. `end` and `asyncEnd` set `status: 'ok'` unless `status` is already `'error'`. `error` sets `status: 'error'` and `error`. `context.result` becomes `record.result` when present. If the message is not an object, each event becomes its own record.
- Each phase update emits the whole record once through `onRecord` listeners and writes it as one chunk to the stream. The browser upserts by `id`.
- Ring buffer: an array capped at 500. When full, drop the oldest.
- When unsupported, `register()` returns a stub with the `TracingChannel` shape whose `traceSync`, `tracePromise` and `traceCallback` call the function directly and whose `hasSubscribers` is `false`. Producers in phase 2 then cost nothing on Deno.

### Serializer (`packages/devframe/src/node/tracing-serialize.ts`, new)

`serializeTraceValue(value, options = { maxDepth: 4, maxString: 2000, maxKeys: 50 }): SerializedValue`

- Primitives pass through. `bigint` becomes a string. `undefined` becomes `null` in arrays and is dropped from objects.
- Functions and symbols are dropped from objects and become `null` in arrays.
- `Error` becomes `{ name, message, stack }`.
- `Date` becomes an ISO string. `Map` and `Set` become arrays of entries. `ArrayBuffer`, typed arrays and `Buffer` become `'[Uint8Array 1024]'` style strings.
- Past `maxDepth`, objects become `'[Object]'` and arrays `'[Array]'`. A seen object becomes `'[Circular]'`. More than `maxKeys` keys are cut and a `'…': '<n> more'` entry is added.
- Never throws. Do not use `devframe/utils/structured-clone`, which throws on functions.

### Wire contract (core owns all of it)

| Piece | Name | Shape |
|---|---|---|
| Shared state | `devframe:tracing:channels` (`DEVFRAME_EVENTS.sharedState.tracingChannels`) | `Record<string, DevframeTracingChannelInfo>`. Mutated on register, record, stop, clear. `count` updates are debounced to at most once per 100 ms per channel. |
| Streaming channel | `devframe:tracing` (`DEVFRAME_EVENTS.stream.tracing`) | One stream per Tracing Channel, `id` = channel name, chunk = `DevframeTraceRecord`, `replayWindow: 500`. Open while recording. |
| Server RPC | `devframe:tracing:record`, `devframe:tracing:stop`, `devframe:tracing:clear` | `type: 'action'`, `args: [s.string()]`, return `void`. Typed in `DevframeRpcServerFunctions`. |

Add the two new groups to `DEVFRAME_EVENTS`:

```ts
sharedState: { tracingChannels: 'devframe:tracing:channels' },
stream: { tracing: 'devframe:tracing' },
```

The shared state is dumped in static builds by the existing `devframe:rpc:server-state:get` dump. The stream is not dumped.

### Configuration

- `DevframeDefinition.tracing?: DevframeTracingOptions` next to `services` (`types/devframe.ts:419`).
- `InitHubOptions.tracing?: DevframeTracingOptions` next to `services` (`hub/initiate.ts:178`).
- Each entry becomes `ctx.tracing.register(name, { description })` with source `config`, applied right after services are installed and before `setup()`: `adapters/initiate.ts:304`, `adapters/build.ts:84`, `adapters/embedded.ts:22`, `hub/initiate.ts:464`, `hub/install-devframe.ts:154` and `:177`, `hub/build.ts:184`.

### Diagnostics

- `DF0081` in `packages/devframe/src/node/diagnostics.ts`: `why: ({ runtime }) => \`Tracing Channels are unavailable: this runtime (${runtime}) does not provide node:diagnostics_channel.tracingChannel\``, `fix: 'Run under Node.js 22+ or Bun to record Tracing Channels. The tracing API is a no-op here.'`. Reported with `method: 'warn'` once per process from `record()`. Use `detectServerRuntime()` from `node/runtime.ts` for the payload.
- New doc page `docs/content/6.errors/DF0081.md`, same sections as `DF0080.md`.

### Phase 2 producers

**`devframe:rpc`** in `rpc-core.ts:102-106`:

```ts
const run = async () => (await fn).apply(this, args)
if (name.startsWith('devframe:tracing:'))
  return await asyncStorage.run({ rpc, meta }, run)
return await rpcTracing.tracePromise(
  () => asyncStorage.run({ rpc, meta }, run),
  { name, type: rpcHost.definitions.get(name)?.type, sessionId: meta.id },
)
```

`rpcTracing` is `context.tracing.register('devframe:rpc', { description: 'Every RPC handler call' })`, created once in `createHostContext`. `tracePromise` writes the resolved value to `context.result` and a rejection to `context.error`. Args are not included on purpose. The inspect History tab already shows them.

**`devframe:shared-state`** in `rpc-shared-state.ts:50-67`: wrap the `SharedState` returned by `host.get()`. `mutate` and `patch` run inside `stateTracing.traceSync(() => state.mutate(fn, syncId), { key, syncId, op: 'mutate' })`. Skip the wrap when `key === DEVFRAME_EVENTS.sharedState.tracingChannels`. The RPC handlers `server-state:set` and `server-state:patch` already go through the same object, so client writes are traced too. `utils/shared-state.ts` does not change.

Both channels are seeded with source `registered` and appear in the Tracing tab by default.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Core tracing tests | `pnpm exec vitest run packages/devframe/src/node/__tests__/host-tracing.test.ts packages/devframe/src/node/__tests__/tracing-serialize.test.ts` | all tests pass |
| RPC and shared-state tests | `pnpm exec vitest run packages/devframe/src/node/__tests__` | all tests pass |
| Runtime-agnostic guard | `pnpm --filter devframe build && pnpm exec vitest run packages/devframe/test/runtime-agnostic.test.ts` | all tests pass |
| Bun smoke | `bun packages/devframe/test/runtime-smoke.ts` | exits 0 |
| API snapshots | `pnpm build && pnpm exec vitest run tests/exports.test.ts -u` | only `devframe` node, types and constants snapshots change, plus `@devframes/hub` in PR1 |
| Inspect plugin tests | `pnpm --filter @devframes/plugin-inspect test` | all tests pass |
| Storybook build | `pnpm --filter storybook build` | exits 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/types/tracing.ts` (new), `types/context.ts`, `types/devframe.ts`, `types/rpc-augments.ts`, `types/index.ts` re-exports
- `packages/devframe/src/node/host-tracing.ts` (new), `node/tracing-serialize.ts` (new), `node/context.ts`, `node/scope.ts`, `node/diagnostics.ts`, `node/rpc-core.ts`, `node/rpc-shared-state.ts`
- `packages/devframe/src/events.ts`, `constants.ts`
- `packages/devframe/src/adapters/{initiate,build,embedded}.ts`
- `packages/hub/src/node/{initiate,install-devframe,build}.ts`
- `plugins/inspect/app/App.vue`, `app/components/TracingSmart.vue` (new), `TracingView.vue` (new), `TracingView.stories.ts` (new), `app/style.css` only if an existing class does not cover a need
- `plugins/inspect/README.md`, `docs/content/5.add-ons/1.devframes/2.inspect.md`
- Docs: `docs/content/1.guide/24.tracing-channels.md` (new), `8.references/1.terms.md`, `3.events.md`, `4.node-api.md`, `6.hub-api.md`, `6.errors/DF0081.md` (new)
- `tests/__snapshots__/tsnapi/**` (affected snapshots only)
- `plans/README.md` status row

**Out of scope**:

- Tracing streaming channels, hub commands or terminals.
- Patching `node:diagnostics_channel` to observe channel creation.
- Subscribing to plain (non-tracing) channels such as `http.server.request.start` or `undici:request:create`.
- A dedicated `@devframes/plugin-tracing` dock.
- Persisting records across process restarts.
- Exporting records to OpenTelemetry. External tools subscribe to the Node channels directly.

## Git workflow

- Three branches, one PR each, in order: `feat/tracing-host`, `feat/inspect-tracing-tab`, `feat/trace-devframe-internals`.
- Commit style: `feat(devframe): add ctx.tracing for Node.js Tracing Channels`, `feat(inspect): add Tracing tab`, `feat(devframe): trace RPC calls and shared-state writes`.
- Each PR passes the full verification on its own. PR2 starts after PR1 merges. PR3 starts after PR1 merges and can run in parallel with PR2.

## Steps

### PR1: core primitive and wire

#### Step 1: Types and events

Add `types/tracing.ts` as specified. Add `tracing: DevframeTracingHost` to `DevframeNodeContext` (`types/context.ts` after `services`) and to the scoped context (`types/scope.ts`, `node/scope.ts:58`). Add `tracing?: DevframeTracingOptions` to `DevframeDefinition` and `InitHubOptions`. Add the `sharedState` and `stream` groups to `DEVFRAME_EVENTS`. Add the three RPC ids to `DevframeRpcServerFunctions` and the shared-state key to `DevframeRpcSharedStates` with the same `@internal` JSDoc the neighbours use.

**Verify**: `pnpm --filter devframe typecheck` exits 0.

#### Step 2: Serializer

Write `tracing-serialize.ts` and a test that covers every bullet in the serializer section: depth cap, string cap, key cap, cycles, `Error`, `Map`, `Set`, `Date`, `bigint`, typed arrays, functions and symbols, and a Node `http.IncomingMessage`-like object with a socket reference.

**Verify**: the serializer test passes and the function never throws on any fixture.

#### Step 3: Host

Write `host-tracing.ts`. Construct it in `createHostContext` and seed the two built-in names. Create the `devframe:tracing` streaming channel and the `devframe:tracing:channels` shared state on first use of the rpc host, mirroring `host-services.ts:313`. Register the three RPC actions. Apply `tracing.channels` from the definition and from hub options at the seven anchors listed under Configuration.

Tests in `host-tracing.test.ts`, each against a real `tracingChannel` from Node:

- `register()` returns the Node channel, is idempotent, accepts an instance, strips the `tracing:` prefix.
- `list()` shows builtin, registered, config and adhoc sources with the stated precedence.
- `record()` then `traceSync` and `tracePromise` on the channel produce one record each with `ok` status, a duration, serialized context and result.
- A throwing `traceSync` produces one record with `error` status and `{ name, message }`.
- `stop()` unsubscribes: `channel.hasSubscribers` turns false and later traces produce no records.
- The buffer caps at 500 and drops the oldest.
- `clear()` empties the buffer and resets the count.
- Stream chunks arrive at a subscribed client with replay after reconnect (reuse the fixture in `rpc-streaming.test.ts`).
- The RPC ids `devframe:tracing:*` are not recorded by any channel (guards PR3).
- Unsupported path: construct the host with an injected module where `tracingChannel` is `undefined`. `record()` reports `DF0081` once and `register()` returns a stub whose `tracePromise` still runs the function.

**Verify**: the core tracing tests pass. `pnpm exec vitest run packages/devframe/test/runtime-agnostic.test.ts` passes without edits, because no agnostic entry imports the new module.

#### Step 4: Diagnostics and docs

Add `DF0081` and its page. Add `Tracing Channel` and `trace record` to `1.terms.md` under `## Node side`. Add the shared-state key and stream name to `3.events.md` under `## Core devframe events` in two new subsections that match the hub page's `Broadcasts & shared state` and stream tables. Add a `ctx.tracing` section and the `tracing` definition field to `4.node-api.md`. Add `tracing` to `6.hub-api.md`. Write `1.guide/24.tracing-channels.md`: what a Tracing Channel is in two sentences, how to list channels in the definition, how a plugin registers one, how to record from a script with `ctx.tracing.onRecord`, and the Deno no-op note.

**Verify**: `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` exits 0. Refresh only the intended snapshots.

### PR2: inspect Tracing tab

#### Step 5: Smart component

`TracingSmart.vue` reads `rpc.sharedState.get('devframe:tracing:channels')` and listens to `updated`, as `StateSmart.vue:72-74` does. On Record it calls `rpc.call('devframe:tracing:record', name)`, then `rpc.streaming.subscribe<DevframeTraceRecord>('devframe:tracing', name)` and upserts each chunk by `id` into a `Map`. Selecting a channel that is already recording subscribes without calling record and receives the replay. Stop calls the RPC and cancels the reader. Clear calls the RPC and empties the local map. Tear down the reader and the shared-state listener in `onScopeDispose`. The ad-hoc input calls `record` with the typed name.

**Verify**: run `pnpm --filter @devframes/plugin-inspect dev`, open the Tracing tab, select `module.require` and press Record. Trigger a `require()` inside the dev server process, for example by opening a route that lazy-loads a module. A record must appear. A `require()` in a different process does not count.

#### Step 6: View component and tab

`TracingView.vue` is props and emits only. Layout follows `StateView.vue:30-74`: left `.keys` list with one `.key-item` per channel showing `DisplayBadge` for the source, a recording dot (`bg-active` when recording) and the count. Right `.state-main` with an `ActionButton` row for Record or Stop and Clear, then the record list newest first, each row with status, relative start time and duration. Clicking a row opens `JsonView` panes for `context`, `result` and `error`, and a short vertical list of `events` with phase and offset from `startedAt`. Reuse `.search` for the ad-hoc input. No new colors, no inline styles. Add `tracing` to the `Tab` union, `allTabs` with icon `i-ph-pulse-duotone`, and the `v-if` chain. Hide it when `isStatic()` next to `instances` at `App.vue:52`. Write `TracingView.stories.ts` with idle, recording and error-record states.

**Verify**: `pnpm --filter storybook build` exits 0. Full verification exits 0.

#### Step 7: Plugin docs

Update `plugins/inspect/README.md` and `docs/content/5.add-ons/1.devframes/2.inspect.md` with one Tracing tab paragraph and a screenshot slot.

### PR3: producers

#### Step 8: `devframe:rpc`

Implement the resolver change in `rpc-core.ts:102-106` as specified. Test in `rpc-core` tests: a client call to a registered query produces one `devframe:rpc` record with `name`, `type`, `sessionId`, `result` and no args. A call to `devframe:tracing:record` produces no record. A rejecting handler produces an `error` record.

**Verify**: RPC tests pass.

#### Step 9: `devframe:shared-state`

Wrap the state in `rpc-shared-state.ts:50-67` as specified. Test: `state.mutate()` and a client `server-state:patch` each produce one record with `key`, `syncId` and `op`. A write to `devframe:tracing:channels` produces none. `utils/shared-state.ts` is unchanged and the runtime-agnostic guard still passes.

**Verify**: shared-state tests and the runtime-agnostic guard pass. Full verification exits 0.

## Test plan

- Register by name and by instance. Idempotent. Precedence of sources.
- Record, trace sync and async, stop, buffer cap, clear.
- Serializer never throws on sockets, requests, cycles, functions.
- Unsupported runtime: no-op plus one `DF0081`.
- Stream replay after reconnect.
- Self-exclusion of the tracing wire pieces.
- Inspect tab stories render idle, recording and error states.
- `devframe:rpc` records carry result but not args.
- `devframe:shared-state` records for node and client writes.

## Done criteria

- [ ] `ctx.tracing` exists on every node context, scoped contexts included.
- [ ] `tracing.channels` on a definition and on hub options appear in the list with source `config`.
- [ ] Recording a channel subscribes only while recording. `hasSubscribers` is false after Stop.
- [ ] Records group all five phases by context and carry a safe serialized payload.
- [ ] Deno runs every tracing call as a no-op with one `DF0081` warning.
- [ ] The inspect plugin shows a Tracing tab with list, Record, Stop, Clear and detail. Hidden in static builds.
- [ ] `devframe:rpc` and `devframe:shared-state` are listed by default and record devframe's own work without a feedback loop.
- [ ] `DEVFRAME_EVENTS`, `3.events.md`, `1.terms.md`, `4.node-api.md`, `6.hub-api.md`, `DF0081.md` and the guide page are in place.
- [ ] Full verification passes on each PR. Only in-scope files and `plans/README.md` changed.

## STOP conditions

- `node:diagnostics_channel` cannot be imported lazily without adding it to a runtime-agnostic entry.
- Grouping by context identity fails for a built-in Node channel because Node passes a fresh object per phase. Report the channel and stop. Do not fall back to heuristics.
- The streaming host cannot close and restart a stream with the same id without leaking listeners (`rpc-streaming.ts:251`). Fix the leak in a separate PR first.
- The inspect tab needs a component shape that `@antfu/design` does not provide.
- API snapshot changes include unrelated exports.

## Maintenance notes

Every new core subsystem that does meaningful work per call must decide whether it gets a Tracing Channel. The answer is yes unless the channel would trace itself. Reviewers must check that a new channel name is registered through `ctx.tracing.register()` so it appears in the inspect tab, and that the exclusion list in `rpc-core.ts` and `rpc-shared-state.ts` stays limited to the tracing wire pieces.
