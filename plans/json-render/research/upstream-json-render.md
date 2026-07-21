# Upstream json-render contracts

Research date: 2026-07-21.

## Scope and pinned sources

- npm's `latest` tag is **`0.19.0`** for both [`@json-render/core`](https://registry.npmjs.org/@json-render%2Fcore/0.19.0) and [`@json-render/vue`](https://registry.npmjs.org/@json-render%2Fvue/0.19.0). They were published on 2026-05-07. The matching source tag is [`v0.19.0`](https://github.com/vercel-labs/json-render/tree/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7), commit `0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7`.
- The comparison target is `vitejs/devtools` **`v0.4.2`**, commit [`1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360`](https://github.com/vitejs/devtools/tree/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360), current on the research date. Its json-render dock began at commit [`9840419fb9a9cd82521dd423af05805ae64e63a6`](https://github.com/vitejs/devtools/commit/9840419fb9a9cd82521dd423af05805ae64e63a6) against `0.13.0`; commit [`5851c3fe9415ba0a216e38e60d334dbb0b2d52c9`](https://github.com/vitejs/devtools/commit/5851c3fe9415ba0a216e38e60d334dbb0b2d52c9) raised the workspace catalog to `^0.19.0` without changing the integration.

## Conclusion

`@devframes/json-render` can directly re-export a **curated, named subset** of `@json-render/core@0.19.0`, but those names then become Devframes semver commitments. It should not use `export *`, derive its durable wire contract solely from upstream `Spec`/Vue `schema`, or let an upstream upgrade silently change accepted specs. Pin the exact upstream version, keep a versioned Devframes protocol and validator, and test that protocol against the supported upstream renderer.

The useful core interoperability surface is `defineSchema`, `defineCatalog`, catalog inference types, `Spec`/`UIElement`, state/visibility/prop/action types and resolvers, `StateStore`/`createStateStore`, and optionally the RFC 6902 stream primitives. Vue-specific registries, providers, hooks, and lifecycle remain the responsibility of `@devframes/json-render-ui`. Devframes must own extension composition and the declared-action allowlist because upstream supplies neither as an enforceable runtime boundary.

## Current contracts

### Schema and catalog typing

`defineSchema` describes separate spec and catalog grammars with a small builder (`object`, `record`, `map`, `ref`, `propsOf`, `zod`, and primitives). `defineCatalog` returns component/action names plus `prompt()`, `jsonSchema()`, `validate()`, and `zodSchema()`; inference helpers expose component props and action params. See the pinned [`schema.ts`](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/schema.ts#L9-L105) and [catalog helpers](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/schema.ts#L219-L371).

The typing is useful but is not a complete runtime protocol validator:

- `defineCatalog` does not parse the catalog data at runtime; TypeScript is the catalog-definition guard.
- With multiple components, `propsOf` deliberately becomes `Record<string, unknown>` rather than a discriminator-coupled props union, so `catalog.validate()` checks component names but not per-component props ([implementation](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/schema.ts#L515-L539)).
- The shipped Vue schema includes `root`, `elements`, `type`, `props`, `children`, and `visible`, but omits top-level `state` and element `on`, `repeat`, and `watch`, although the runtime `Spec`/`UIElement` types support all four ([Vue schema](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/schema.ts#L10-L75), [runtime types](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/types.ts#L53-L78)). The generated Zod objects are ordinary `z.object` schemas, so undeclared fields are not a durable validation contract.
- Strict JSON Schema cannot represent dynamic-key records and emits them as empty, closed objects; upstream documents this limitation ([`JsonSchemaOptions`](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/schema.ts#L107-L127)).

Devframes should therefore define and validate its complete versioned spec shape itself, while preserving structural compatibility with the selected upstream types.

### Registries and extension composition

Vue's `defineRegistry(catalog, { components, actions })` maps typed render functions into Vue components. Actions are conditionally required when the catalog has action keys, but the catalog argument is unused at runtime and `components` itself is optional. The low-level `Renderer` also accepts any `Record<string, Component>` and an optional fallback ([registry implementation](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/renderer.ts#L739-L888)). Rendering does not Zod-parse resolved props.

There is no upstream catalog/registry extend or merge API, collision policy, extension identity, or version negotiation. Consumers compose object maps before calling `defineCatalog`/`defineRegistry`. `0.19.0` adds composable custom prop directives, but this is a different extension mechanism: `defineDirective` reserves built-in `$` keys, nested directives can resolve one another, and `createDirectiveRegistry` uses last-write-wins for duplicate names ([directives source](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/directives.ts#L24-L123)). Devframes must own explicit catalog-extension composition, duplicate handling, and protocol compatibility.

### State, bindings, and expressions

The state model is `Record<string, unknown>` addressed by JSON Pointer. `StateStore` offers `get`, immutable-reference-sensitive `set`, batched `update`, snapshots, and subscription; an external store is supported ([contract](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/types.ts#L182-L215)). Prop expressions include `$state`, repeat-scoped `$item`/`$index`, two-way `$bindState`/`$bindItem`, `$cond`, `$computed`, `$template`, and custom directives; binding resolution separately returns writable absolute paths ([expression contract](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/props.ts#L10-L67), [resolution](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/props.ts#L198-L366)). Visibility supports state/item/index truthiness, comparisons, `not`, implicit/explicit AND, and OR ([visibility source](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/visibility.ts#L240-L348)).

These are renderer-evaluated capabilities, not inert data. Devframes should either adopt each expression in the protocol and test every official renderer, or reject it. `$computed` and custom directives execute host-registered code and should be explicit extensions, not portable base-catalog assumptions.

### Actions and validation

An element event maps to one or more `ActionBinding`s. A binding names an action and can carry dynamic params, confirmation, success/error behavior, and `preventDefault`; handlers may be sync or async ([action contract](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/actions.ts#L31-L131)). Vue resolves bindings sequentially, tracks loading by action name, supports confirmation and chaining, and handles `setState`, `pushState`, `removeState`, and `validateForm` internally ([Vue action provider](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/composables/actions.ts#L145-L337)).

Catalog action `params` schemas are prompt/type metadata: Vue does not parse params against them before dispatch, and unknown runtime actions merely warn. Likewise, unknown validation function names warn and pass as valid ([validation behavior](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/validation.ts#L267-L305)). Built-in field checks and custom validation functions are available, with Vue field registration and `validateForm` aggregation ([Vue validation provider](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/composables/validation.ts#L102-L201)).

Consequently, Devframes' declared-action contract must validate the action name and params before crossing RPC. Built-ins need an explicit reserved list and semantics. Upstream registry typing alone is not an authorization or validation boundary.

### Streaming

Core's SpecStream is newline-delimited RFC 6902 patches. It supplies line parsing, mutable patch application, incremental compilation, mixed prose/spec parsing, AI SDK-compatible `TransformStream` classification, `data-spec` payloads, nested-to-flat conversion, and `pipeJsonRender` without depending on the AI SDK ([stream compiler](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/types.ts#L540-L879), [AI stream contract](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/types.ts#L987-L1305)). Vue adds browser-fetch `useUIStream` and `useChatUI`, aborting requests on unmount ([hooks](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/hooks.ts#L213-L395)).

The stream surface should be optional in the first Devframes contract. It is generation transport, not required for rendering a complete remote spec. If adopted, Devframes should reuse core's patch semantics rather than Vue's separate hook implementation: Vue's local `useUIStream` patcher treats RFC 6902 `test` as a no-op, whereas core throws on a failed test ([Vue patcher](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/hooks.ts#L170-L211), [core patcher](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/src/types.ts#L571-L617)). Validate patches and resource limits before applying untrusted streams.

### Vue renderer lifecycle

`Renderer` returns nothing for a null/missing root, recursively resolves visibility/props/bindings, repeats child templates over state arrays, uses fallback-or-null for unknown components, warns for missing children after loading, and isolates component render errors by rendering that element as null ([renderer](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/renderer.ts#L365-L584)). `JSONUIProvider` nests state, visibility, validation, action, computed-function, and directive providers and adds the default confirmation UI ([provider tree](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/renderer.ts#L607-L737)).

`StateProvider` chooses controlled versus internal state once at setup, subscribes until unmount, and in uncontrolled mode watches later `initialState` changes by flattening them to pointer updates. A replaced `store` prop does not switch stores, and `Renderer` does not automatically seed state from `spec.state`; the caller must pass it to the provider ([state lifecycle](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/vue/src/composables/state.ts#L59-L180)). The official Devframes shell should make remount/reset/preserve-state behavior explicit when view identity or protocol version changes.

## `vitejs/devtools` comparison

The current workspace and lock resolve `@json-render/core` and `@json-render/vue` to `0.19.0` ([catalog](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/pnpm-workspace.yaml#L122-L123), [lock](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/pnpm-lock.yaml#L205-L210)). Its build explicitly bundles both packages ([tsdown config](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/tsdown.config.ts#L14-L44)). However, `packages/core/package.json` still records both inlined dependency versions as `0.13.0` ([stale metadata](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/package.json#L114-L129)). Thus the executable integration is `0.19.0`; `0.13.0` describes its origin and stale attribution metadata, not the resolved bundle.

Its behavior remains the original `0.13.0` integration:

- A custom schema/catalog lists the built-in components but omits state, visibility, repeat, watch, and event fields and declares no actions ([catalog](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/catalog.ts#L8-L153)). The catalog is exported but never used to validate specs.
- A raw Vue component record is passed directly to `Renderer`, bypassing `defineRegistry` and catalog-derived component checks ([registry](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/registry.ts#L17-L32)). It uses upstream `useBoundProp` for inputs and switches.
- `ViewJsonRender` subscribes to a shared complete spec, feeds `spec.state` into `JSONUIProvider`, and replaces the rendered spec on updates. Its `Proxy` claims every action exists and calls an RPC whose name is the unvalidated action string ([view](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/components/views/ViewJsonRender.vue#L18-L104)). This arbitrary action-to-RPC bridge is precisely the behavior Devframes should replace with per-view declarations and param validation.
- It does not use upstream streaming, catalog validation, field validation, computed functions, directives, or extension composition. The `0.13.0` to `0.19.0` changes relevant to this integration are additive: edit/diff helpers, devtools hooks, improved Zod prompt formatting, and `0.19.0` directives ([upstream changelog](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/CHANGELOG.md#L3-L34)).

## Package shape, stability, and license

`@json-render/core@0.19.0` exports `.` and `./store-utils` in ESM and CommonJS, depends on `zod ^4.3.6`, and also declares `zod ^4.0.0` as a peer ([package](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/package.json)). `@json-render/vue@0.19.0` exports `.` and the server-safe `./schema`, depends exactly on core `0.19.0`, and peers on `vue ^3.5.0` and `zod ^4.0.0` ([npm manifest](https://registry.npmjs.org/@json-render%2Fvue/0.19.0)). Catalog types expose Zod types publicly, so Devframes should align one Zod 4 instance and keep Vue/core versions paired.

The project is pre-1.0 and young: core published `0.0.1` on 2026-01-14 and reached `0.19.0` by 2026-05-07; Vue moved from `0.9.1` on 2026-02-25 to `0.19.0` in ten weeks ([core registry history](https://registry.npmjs.org/@json-render%2Fcore), [Vue registry history](https://registry.npmjs.org/@json-render%2Fvue)). Documented breaking changes have already renamed the expression language, repeat/action fields, provider props, generation modes, and removed APIs ([core changelog](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/packages/core/CHANGELOG.md#L300-L363)). Exact pinning and an explicit upstream-upgrade review are warranted.

Both packages and the repository are **Apache-2.0** ([license](https://github.com/vercel-labs/json-render/blob/0bbe6ed6394b23b5aee25320d03c9b7ac717e5b7/LICENSE)); the pinned tree has no `NOTICE` file. Direct dependency/re-export is compatible with Devframes' licensing, while any redistributed or bundled upstream object code must include the Apache 2.0 license, retain applicable notices, and mark modified upstream files. The license also includes a patent grant and patent-litigation termination clause. Package naming and documentation must not imply Vercel endorsement or trademark rights.

## Recommended boundary

1. Make the Devframes protocol schema, catalog version, extension IDs, action declarations, and validation/error behavior authoritative.
2. Re-export only reviewed core names with explicit export lists; treat additions/removals as Devframes API changes and pin `0.19.0` until compatibility is retested.
3. Keep upstream prompt/generation/edit/devtools hooks and Vue streaming hooks outside the portable base. Add opt-in subpaths later if required.
4. Validate complete specs, component props, action names, and action params at trust boundaries. Do not copy Vite DevTools' catch-all RPC proxy.
5. Let `@devframes/json-render-ui` adapt the Devframes protocol to `@json-render/vue`, own provider lifecycle and registry composition, and expose third-party registry replacement without making Vue part of the protocol package.
