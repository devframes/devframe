---
outline: deep
---

# Events Reference

Devframe carries change notifications across channels separated by **direction and reach**: an in-process node event bus, server RPC methods a client calls, and server-pushed broadcasts and shared state a client reads.

Two prefixes mark the wire surface: `hub:` for hub-layer server RPC (client → server), and `devframe:` for the client-facing devframe protocol (broadcasts, shared state, streams, server → client). The internal event bus mirrors the same subsystem vocabulary (`docks`, `terminals`, `messages`, `commands`) — `docks:activate` fans out to `devframe:docks:activate`.

Every name here has one home in code: the [`HUB_EVENTS`](https://github.com/devframes/devframe/blob/main/packages/hub/src/events.ts) map (`@devframes/hub/constants`) backs the hub tables, the [`DEVFRAME_EVENTS`](https://github.com/devframes/devframe/blob/main/packages/devframe/src/events.ts) map (`devframe/constants`) backs the core tables. Call sites reference `HUB_EVENTS.*` / `DEVFRAME_EVENTS.*` rather than a literal; this page moves with those maps.

## Hub events

### Internal node event bus

Each subsystem host emits on `ctx.<subsystem>.events`. These fire and are consumed **inside the same node process** — chiefly by `createHubContext`, which fans them onto the wire — never crossing to the browser.

| Event | Emitted by | Consumed by | Payload |
|---|---|---|---|
| `docks:entry:updated` | `DocksHost.register` / `update` | context → `devframe:docks` shared state | `DevframeDockUserEntry` |
| `docks:activate` | `DocksHost.activate()` | context → broadcast + `devframe:docks:active` | `DevframeDockActivation` |
| `terminals:session:updated` | `TerminalsHost` register / update / remove / status change | context → `devframe:terminals:updated`; terminals plugin | `DevframeTerminalSession` |
| `messages:added` / `messages:updated` / `messages:removed` / `messages:cleared` | `MessagesHost` mutations | context → `devframe:messages:updated`; messages plugin | entry / entry / id / — |
| `commands:registered` / `commands:unregistered` | `CommandsHost` register / update / unregister | context → `devframe:commands` shared state | entry / id |

### Server RPC methods — client → server

A connected client calls these; the hub node handles them. They carry the `hub:` prefix.

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

The server pushes these; a hub-aware client reads or subscribes via `rpc.client.register(...)`. They carry the `devframe:` prefix. The [client host](./client-context) registers the `devframe:docks:activate` handler for you.

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

## Core devframe events

The core `devframe` runtime carries its own notification channels, backed by `DEVFRAME_EVENTS` (`devframe/constants`).

This map covers notifications only. The request/response RPC endpoints (`devframe:rpc:server-state:*`, `devframe:streaming:subscribe`, `anonymous:devframe:auth`, …) are defined at their handlers and typed in `types/rpc-augments.ts` — not events.

### Node host bus

Emitted on `ctx.agent.events` as the agent's tool/resource surface changes; protocol adapters (e.g. the MCP server) subscribe to re-publish their manifest.

| Event | Emitted by | Payload |
|---|---|---|
| `agent:manifest:changed` | any tool/resource/provider change | — |
| `agent:tool:registered` / `agent:tool:unregistered` | `registerTool` / `unregisterTool` | `AgentTool` / id |
| `agent:resource:registered` / `agent:resource:unregistered` | `registerResource` / `unregisterResource` | `AgentResource` / id |

### Client connection events

Emitted on the RPC client's `rpc.events` emitter (`RpcClientEvents`) for a UI to track connection lifecycle and errors.

| Event | Carries |
|---|---|
| `rpc:is-trusted:updated` | Trust gate flipped (`boolean`). |
| `rpc:error` | An RPC call rejected (`error`, `method`). |
| `connection:status` | Connection status changed (`status`, `previous`). |
| `connection:error` | A connection-level error (WebSocket errored, or trust refused). |

### Broadcasts — server → client

Pushed from server to subscribed clients over the `devframe:` protocol. Wired by the framework's own hosts.

| Name | Carries |
|---|---|
| `devframe:auth:revoked` | This connection's bearer token was revoked; the client drops to untrusted. |
| `devframe:rpc:client-state:updated` | Full shared-state snapshot for a key. |
| `devframe:rpc:client-state:patch` | Incremental shared-state patch for a key. |
| `devframe:streaming:chunk` | A streaming chunk for a subscribed channel/id. |
| `devframe:streaming:end` | A streaming terminator (optionally an error). |
| `devframe:streaming:upload-cancel` | Server-side cancel of an in-flight upload. |

Plus one `postMessage` channel, `devframe:remote-assets-error`, that the remote-assets fallback page posts to `window.parent` so an embedding viewer can replace the bare 502 page.
