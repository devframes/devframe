# 04 - Code conventions

## RPC

RPC functions MUST use `defineRpcFunction`. Built-in devframes MUST namespace IDs `devframes:plugin:<slug>:<fn-name>` - the literal `plugin:` token mirrors the `@devframes/plugin-<slug>` package name on the wire; it is npm namespacing, not a concept.

## Event names come from the centralized maps

Every event, broadcast, shared-state key, and channel name lives in one of two source-of-truth maps: `DEVFRAME_EVENTS` (`packages/devframe/src/events.ts`, re-exported from `devframe/constants`) for the core runtime, and `HUB_EVENTS` (`packages/hub/src/events.ts`, re-exported from `@devframes/hub/constants`) for the hub. Call sites (`.events.emit`/`.on`, `rpc.broadcast({ method })`, `sharedState.get(key)`, `defineHubRpcFunction({ name })`, `rpc.call`) MUST reference `DEVFRAME_EVENTS.*` / `HUB_EVENTS.*`, never a re-typed string literal.

The two maps and the [`docs/content/8.references/3.events.md`](../docs/content/8.references/3.events.md) Events Reference stay in lockstep: adding, renaming, or removing a name means editing the map **and** that page in the same change; every name in the maps appears in the tables, and vice versa.

Permitted literals: unavoidable type-position keys (the `EventEmitter<…>` maps in `types/*` and the `DevframeRpcClientFunctions`/`DevframeRpcServerFunctions` augmentations), which mirror the maps; and a package that deliberately avoids a hub dependency (e.g. `@devframes/plugin-terminals`, which models the hub bridge structurally) keeps a local literal rather than importing `HUB_EVENTS`.

## Validator neutrality

`devframe` and every `@devframes/*` package MUST NOT carry a schema validator (`valibot`, `zod`, `arktype`, …) in their runtime `dependencies`. `args`/`returns`/flag schemas are typed against [Standard Schema](https://standardschema.dev/) (`@standard-schema/spec`, types-only); first-party code that needs to author a schema uses the built-in zero-dep `devframe/utils/simple-schema` builder (deliberately minimal - not a general validator). JSON-schema conversion uses each schema's own Standard JSON Schema converter (`~standard.jsonSchema`, implemented by e.g. zod 4) when present and degrades to a permissive object otherwise - no converter library, no vendor dependency.

Docs, by contrast, SHOULD point *users* at a real validator for their own integrations - recommend **valibot** (lightest) or **zod** (worth reusing if they already pull it via the JSON-render or MCP integrations).

## Imports, state, dependencies

- Shared state goes through `devframe/utils/shared-state`; values MUST stay serializable.
- Utility imports use the package-path form `devframe/utils/*`, never relative `../utils/*`.
- Dependencies go through the pnpm catalogs in `pnpm-workspace.yaml` (`cli`, `inlined`, `testing`, `types`) - add to a catalog and reference as `catalog:<name>`; versions MUST NOT be pinned in a `package.json`.

## Default exports are factories

A built-in devframe's default export MUST be its `create<X>Devframe` factory, never a pre-built instance. `export default createXDevframe()` (or the two-line equivalent) eagerly constructs a `DevframeDefinition` at import time whether or not any consumer wants that exact zero-config shape; a consumer that needs its own options (an id override, a data directory, …) pays for a second, discarded instance. Alias the factory itself - `export default createXDevframe` - so importing costs nothing and every consumer calls it to get their own instance: `import createA11yDevframe from '@devframes/plugin-a11y'` then `createA11yDevframe(options)`.
