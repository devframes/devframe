# Plugin 01 — RPC & State self-inspector

**Package:** `@devframes/plugin-rpc` · **Dir:** `plugins/rpc/`
**Inspiration:** port of the RPC + shared-state inspector panels from
`vitejs/devtools`.
**SPA stack (Axis B):** Vue + Vite (direct port).
**Diagnostics band:** `DF90xx`.

## Why first

This is the scaffolding plugin. It is the lowest-risk port, it self-validates the
core wire (RPC registry, shared-state, dump, connection meta, agent surface), and
once it exists it becomes the debugger we use while building every other plugin.
Building it establishes the package/tsdown/alias/turbo scaffolding the rest copy.

## What it does

A devframe that introspects *its own connection* (and, when mounted in a hub, the
hub's): list every registered RPC function with metadata (name, `type`,
`jsonSerializable`, `snapshot`, arg schema), let the user invoke `query` functions
with arguments and inspect results, watch every shared-state key live, and browse
the agent-exposed surface. Essentially the devframe equivalent of the vitejs
DevTools "RPC" and "State" tabs.

## Dogfooding intent

Primary surface: **RPC introspection + shared-state + RPC dump + `connectionMeta`
+ agent host**. This is the most self-referential plugin — it consumes the exact
APIs every other plugin produces, so it is the fastest way to discover whether:

- the RPC registry exposes enough metadata to render a useful inspector (names,
  types, valibot arg schemas, `jsonSerializable` flags from `ConnectionMeta`);
- shared-state subscription/broadcast semantics are observable from the client;
- the static `rpc/dump` output round-trips for the `build`/`spa` modes;
- the agent surface (`ctx.agent`, the `BUILTIN_AGENT_RPC`) is browsable.

Expected gaps: missing introspection getters (may need a built-in
`rpc:list-functions` style meta RPC in core), dump fidelity for non-JSON values,
and how a devframe inspects a connection it is *also* part of.

## Host integrations (Axis A)

- `.` — `createRpcInspectorDevframe()` factory + default `DevframeDefinition`.
- `/cli` — `npx @devframes/plugin-rpc` opens the inspector against a target.
- `/vite` — mount into a Vite host to inspect that host's devframe connection.
- `/client` — Vue mount helpers + any dock `custom-render` modules.

## Package layout

```
plugins/rpc/
  src/
    index.ts            # `.`   default DevframeDefinition + factory
    node/index.ts       # `/node` setup(ctx): register introspection RPCs + docks
    client/index.ts     # `/client` Vue app mount + custom-render dock
    cli.ts              # `/cli`
    vite.ts             # `/vite`
    rpc/
      index.ts          # serverFunctions tuple + DevframeRpcServerFunctions augment
      functions/
        list-functions.ts   # rpc:list-functions  (query, snapshot)
        invoke.ts            # rpc:invoke           (action) — gated to query fns
        list-state-keys.ts   # rpc:list-state-keys  (query)
        describe-agent.ts    # rpc:describe-agent   (query, snapshot)
    spa/                # Vue + Vite UI
  bin.mjs
  test/
```

## Node side

- RPC (namespaced `rpc:*`):
  - `rpc:list-functions` — `query`, `snapshot: true`, `jsonSerializable: true`:
    returns the registry with metadata. May need a core hook to read the registry;
    if absent, that is a tracked gap to add to `devframe` core.
  - `rpc:invoke` — `action`: invoke a named `query` function with validated args;
    refuse `action`/mutating functions for safety.
  - `rpc:list-state-keys` — enumerate shared-state keys + current snapshots.
  - `rpc:describe-agent` — surface `ctx.agent` tools/resources.
- Docks: a single `iframe` (or `custom-render`) dock `rpc:inspector` titled
  "RPC & State", icon e.g. `ph:plugs-duotone`.
- Shared state observed (read-only): all keys; no new keys written except a small
  `rpc:inspector:ui` for persisted panel UI prefs (serializable).

## Client side

- Vue SPA: three views — Functions (list + invoke), State (live key watcher with
  diff), Agent (tools/resources tree). Connects via `connectDevframe()`; derives
  base from `document.baseURI`; handles both `websocket` and `static` backends
  (degrade invoke to read-only when `backend === 'static'`).

## Milestones

1. Scaffold package + tsdown three-config + alias/turbo/workspace wiring (this is
   the template all others copy).
2. `rpc:list-functions` + Functions view (read-only).
3. `rpc:invoke` for `query` functions + result rendering.
4. State view with live subscription + diff.
5. Agent view; `static`/`spa` degradation; tsnapi snapshot + e2e.

## Open questions / risks

- Does core expose (or should it expose) a registry-introspection API? If not,
  decide whether to add a built-in meta RPC to `devframe` core vs. keep it in the
  plugin. **This is likely the first real framework change the effort forces.**
- How much of the `vitejs/devtools` Vue code ports cleanly vs. needs a rewrite
  against devframe's client (`connectDevframe`, `rpc.sharedState`) rather than
  Vite DevTools' kit client.
- Safety model for `rpc:invoke` (which function types are invokable; argument
  validation surface).
