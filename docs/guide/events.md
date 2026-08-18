---
outline: deep
---

# Events Reference

Devframe carries change notifications across a few distinct channels. What separates them is **direction and reach**: an in-process event bus that never leaves the node process, server RPC methods a client calls, and server-pushed broadcasts and shared state a client reads.

Two naming prefixes mark the wire surface: `hub:` for hub-layer server RPC (client → server actions), and `devframe:` for the client-facing devframe protocol (broadcasts, shared state, and streams pushed server → client). The internal event bus mirrors the same plural subsystem vocabulary (`docks`, `terminals`, `messages`, `commands`), so each internal event lines up with its wire counterpart — `docks:activate` fans out to `devframe:docks:activate`.

Every name on this page has one home in code: the [`HUB_EVENTS`](https://github.com/devframes/devframe/blob/main/packages/hub/src/events.ts) map (`@devframes/hub/constants`) backs the hub tables, and the [`DEVFRAME_EVENTS`](https://github.com/devframes/devframe/blob/main/packages/devframe/src/events.ts) map (`devframe/constants`) backs the core tables. Call sites reference `HUB_EVENTS.*` / `DEVFRAME_EVENTS.*` rather than re-typing a literal, and this page and those maps move together — changing one without the other is a bug.

## Hub events

### Internal node event bus

Each subsystem host emits on `ctx.<subsystem>.events`. These fire and are consumed **inside the same node process** — chiefly by `createHubContext`, which fans them out onto the wire. They never cross to the browser.

| Event | Emitted by | Consumed by | Payload |
|---|---|---|---|
| `docks:entry:updated` | `DocksHost.register` / `update` | context → `devframe:docks` shared state | `DevframeDockUserEntry` |
| `docks:activate` | `DocksHost.activate()` | context → broadcast + `devframe:docks:active` | `DevframeDockActivation` |
| `terminals:session:updated` | `TerminalsHost` register / update / remove / status change | context → `devframe:terminals:updated`; terminals plugin | `DevframeTerminalSession` |
| `messages:added` / `messages:updated` / `messages:removed` / `messages:cleared` | `MessagesHost` mutations | context → `devframe:messages:updated`; messages plugin | entry / entry / id / — |
| `commands:registered` / `commands:unregistered` | `CommandsHost` register / update / unregister | context → `devframe:commands` shared state | entry / id |

The `docks:entry:updated` and `terminals:session:updated` middle nouns (`entry`, `session`) name the specific record type; the messages and commands subsystems imply their record in the subsystem name, so they carry the verb directly.

### Server RPC methods — client → server

A connected client (any mounted iframe or panel, on its own RPC client) calls these; the hub node handles them. Carry the `hub:` prefix.

| Method | Signature | Purpose |
|---|---|---|
| `hub:docks:activate` | `({ dockId, params? }) => void` | Ask the viewer to switch its active dock — see [Deep Linking](./deep-linking). |
| `hub:commands:execute` | `(id, ...args) => unknown` | Invoke a registered server command by id. |
| `hub:messages:add` | `(input) => DevframeMessageEntry` | Add a message to the feed (marked `from: 'browser'`). |
| `hub:messages:update` | `(id, patch) => DevframeMessageEntry \| undefined` | Patch a message by id. |
| `hub:messages:remove` | `(id) => void` | Remove a message by id. |
| `hub:messages:clear` | `() => void` | Remove every message. |
| `hub:terminals:write` | `(id, data) => void` | Send input to an interactive PTY session. |
| `hub:terminals:resize` | `(id, cols, rows) => void` | Resize an interactive PTY session. |
| `hub:terminals:terminate` | `(id) => void` | Kill a session's process, keeping it registered. |
| `hub:terminals:restart` | `(id) => void` | Re-run a session's command in place. |
| `hub:terminals:remove` | `(id) => void` | Kill a session's process and drop it from the registry. |

### Broadcasts & shared state — server → client

The server pushes these; a hub-aware client reads or subscribes. Carry the `devframe:` prefix. A UI subscribes to broadcasts via `rpc.client.register(...)`; the [client host](./client-context) registers the `devframe:docks:activate` handler for you.

| Name | Kind | Carries |
|---|---|---|
| `devframe:docks:activate` | broadcast | Live "switch active dock" request — the client host calls its local `switchEntry`. |
| `devframe:terminals:updated` | broadcast | Terminal sessions changed; re-read terminal state. |
| `devframe:messages:updated` | broadcast | Message list changed; re-read message state. |
| `devframe:docks` | shared state | Projected dock entry list (`DevframeDockEntry[]`). |
| `devframe:docks:active` | shared state | Most recent `DevframeDockActivation`, so a dock that mounts in response still converges on it. |
| `devframe:commands` | shared state | Serializable command list, handlers stripped (`DevframeServerCommandEntry[]`). |
| `devframe:user-settings` | shared state | Persisted per-workspace hub settings (`DevframeDocksUserSettings`). |
| `devframe:terminals` | streaming channel | Live terminal output stream, keyed by session id. |

The [`devframe:docks:active`](./shared-state) mirror pairs with the `devframe:docks:activate` broadcast: the broadcast reaches docks already on screen, while the mirror lets a dock that mounts *because* of the switch converge on the same request instead of missing it.

## Core devframe events

The core `devframe` runtime (below the hub) carries its own notification channels — the agent host's change events, the client connection lifecycle, and the server-pushed broadcasts that power shared state and streaming. These are backed by `DEVFRAME_EVENTS` (`devframe/constants`).

This map covers notifications only. The request/response RPC endpoints of the shared-state, streaming, and auth-handshake protocols (`devframe:rpc:server-state:*`, `devframe:streaming:subscribe`, `anonymous:devframe:auth`, …) are defined at their handlers and typed in `types/rpc-augments.ts` — they aren't events.

### Node host bus

Emitted on `ctx.agent.events` as the agent-exposed tool/resource surface changes; protocol adapters (e.g. the MCP server) subscribe to re-publish their manifest.

| Event | Emitted by | Payload |
|---|---|---|
| `agent:manifest:changed` | any tool/resource/provider change | — |
| `agent:tool:registered` / `agent:tool:unregistered` | `registerTool` / `unregisterTool` | `AgentTool` / id |
| `agent:resource:registered` / `agent:resource:unregistered` | `registerResource` / `unregisterResource` | `AgentResource` / id |

### Client connection events

Emitted on the RPC client's `rpc.events` emitter (`RpcClientEvents`) for a UI to track connection lifecycle and surface errors.

| Event | Carries |
|---|---|
| `rpc:is-trusted:updated` | Trust gate flipped (`boolean`). |
| `rpc:error` | An RPC call rejected (`error`, `method`). |
| `connection:status` | Connection status changed (`status`, `previous`). |
| `connection:error` | A connection-level error (WebSocket errored, or trust refused). |

### Broadcasts — server → client

Pushed from the server to subscribed clients over the `devframe:` protocol. Wired by the framework's own hosts; not registered manually.

| Name | Carries |
|---|---|
| `devframe:auth:revoked` | This connection's bearer token was revoked; the client drops to untrusted. |
| `devframe:rpc:client-state:updated` | Full shared-state snapshot for a key. |
| `devframe:rpc:client-state:patch` | Incremental shared-state patch for a key. |
| `devframe:streaming:chunk` | A streaming chunk for a subscribed channel/id. |
| `devframe:streaming:end` | A streaming terminator (optionally an error). |
| `devframe:streaming:upload-cancel` | Server-side cancel of an in-flight upload. |

Plus one `postMessage` channel, `devframe:remote-assets-error`, that the remote-assets fallback page posts to `window.parent` so an embedding viewer can replace the bare 502 page with its own UI.
