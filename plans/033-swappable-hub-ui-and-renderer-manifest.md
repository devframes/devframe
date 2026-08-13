# Plan 033: Swappable UI packages — renderer-module manifest + missing-renderer fallback

## Status

- **Priority**: P1
- **Effort**: L (hub protocol + client, json-render contract move, json-render-ui module build, hub-ui decoupling, examples, docs)
- **Risk**: MEDIUM (breaking for `@devframes/hub-ui` consumers who relied on its bundled json-render rendering; lands in the 0.9 breaking wave)
- **Depends on**: none (complements plan 032 — `hub-ui`/`json-render*` stay the canonical external consumers)
- **Planned at**: 2026-08-13

## Goal

Make the headless/UI split fully swappable, both ways, independently:

- `devframe`, `@devframes/hub`, `@devframes/json-render` — headless (already true).
- `@devframes/hub-ui` — opinionated reference viewer, replaceable by any
  community implementation of the `DevframeHubUi` slot + client contracts.
- `@devframes/json-render-ui` — opinionated reference renderer, replaceable by
  any implementation of the json-render renderer contract.
- The two swap **independently**: hub-ui knows nothing about json-render
  rendering. When no json-render renderer is present, hub-ui shows a designed
  fallback: *No renderer for "json-render" in the current environment.*

Today's gaps:

1. `packages/hub-ui/src/client/json-render/` bundles its own Vue json-render
   components and `ViewEntry.vue` hard-routes `type === 'json-render'` to them
   — hub-ui and json-render-ui are **not** independently swappable.
2. The json-render renderer interface is declared structurally inside
   json-render-ui (`src/dock-renderer.ts`) — the implementer owns its own
   contract.
3. A missing renderer is `console.warn` + silent no-op
   (`hub/src/client/renderers.ts` `mount`).
4. A prebuilt viewer (hub-ui's SPA / embedded.js) has no way to receive a
   renderer registered at the host's `createDevframeClientHost` — there is no
   composition seam for renderer modules.

## Decisions (settled by interview)

| # | Decision |
|---|---|
| 1 | Contracts stay in `@devframes/hub` (`DevframeHubUi` node slot + client `DockRenderer` registry); no new contract package. |
| 2 | The json-render renderer contract moves to `@devframes/json-render/hub`, typed against `@devframes/hub` via type-only imports. |
| 3 | hub-ui deletes its bundled JR rendering and delegates everything non-native to the renderer registry. |
| 4 | New **renderer-module manifest**: `initHub({ renderers })` takes registration objects; the hub serves each prebuilt browser ESM bundle and publishes a `ClientScriptEntry`-shaped manifest over shared state. |
| 5 | A manifest module's export (default; `importName` overridable) is a **ready `DockRenderer`**. |
| 6 | Client loading is **lazy** (first mount of that dock type, cached); **locally passed renderers win** over manifest entries. |
| 7 | Renderers are **self-styling and shadow-root-safe**: they inject their own CSS into the container's root. Theme contract: the viewer mirrors a live `dark` class onto the mount container; CSS custom properties inherit across the boundary. |
| 8 | `renderers.mount()` returns a discriminated result — `mounted` / `missing-renderer` / `load-error` — plus an availability query; `console.warn` kept as a side effect. |
| 9 | Fallback is **generic** (any unregistered type), one view across panel/edge/standalone: muted icon + `No renderer for "<type>" in the current environment` + generic hint. `load-error` variant shows the error and a retry button. No package-name special-casing. |
| 10 | Node-side manifest failures are DF81xx structured diagnostics with docs pages. |
| 11 | Minimal examples compose json-render-ui via the manifest; `hub-vite` + `hub-next` witnesses demo the manifest **and** the fallback, at parity. |
| 12 | Docs: "Build your own hub UI" and "Build your own json-render frontend" guides. |
| 13 | Single PR, part of the v0.9 wave. |

## Design

### 1. Hub node: `initHub({ renderers })`

```ts
/** One dock-type → prebuilt renderer-module registration. */
export interface DockRendererRegistration {
  /** Dock `type` this renderer handles (e.g. `'json-render'`). */
  type: string
  /** Absolute path of the prebuilt, self-contained browser ES module. */
  file: string
  /** Named export carrying the renderer. @default 'default' */
  importName?: string
}

initHub({ renderers: [jsonRenderUiRenderer()] })
```

- Each registration's bundle is served (buffered, like `embedded.js`) at
  `<base>__renderers/<type>.mjs`; `__renderers` joins `RESERVED_HUB_PATHS`.
- The manifest is published into shared state at `devframe:dock-renderers` as
  `Record<string /* type */, ClientScriptEntry>` with base-absolute
  `importFrom` URLs — same convention as `__client-imports.js`.
- Diagnostics: `DF8108` duplicate renderer type; `DF8109` missing bundle file;
  `DF8110` non-URL-safe type.

### 2. Hub client: shared renderer registry + typed mount result

`hub/src/client/renderers.ts` gains a factory both consumers reuse
(`createDevframeClientHost` **and** hub-ui's own context assembly):

```ts
export type DockRendererMountResult =
  | { status: 'mounted', dispose: () => void }
  | { status: 'missing-renderer' }
  | { status: 'load-error', error: unknown }

export interface DockRenderersContext {
  register: (type: string, renderer: DockRenderer) => () => void
  get: (type: string) => DockRenderer | undefined
  /** True when a local renderer OR a manifest module exists for `type`. */
  has: (type: string) => boolean
  mount: (entry: DevframeDockEntry, container: HTMLElement) => Promise<DockRendererMountResult>
}

export function createDockRenderersContext(options: {
  context: () => DevframeClientContext
  local?: Record<string, DockRenderer>
  manifest?: () => Record<string, ClientScriptEntry>
  onMounted?: (dispose: () => void, entry: DevframeDockEntry) => void
}): DockRenderersContext
```

- `mount()` resolution: local registration → manifest module (native dynamic
  `import()`, cached per type, registered on success) → `missing-renderer`.
- Import/mount failures resolve `load-error` (the failed import is not cached,
  so a retry re-imports).
- `DockRenderer` becomes generic (`DockRenderer<Entry extends DevframeDockEntry
  = DevframeDockEntry>`) so integration packages can export precisely-typed
  renderer contracts.
- `createDevframeClientHost` reads the `devframe:dock-renderers` shared state
  alongside docks and passes it as the manifest.

**Breaking**: `mount()` previously resolved a bare disposer. 0.9 migration
note: use `result.status === 'mounted' ? result.dispose : …`.

### 3. `@devframes/json-render/hub`: the renderer contract

```ts
export type JsonRenderDockMountOptions = DockRendererMountOptions<DevframeJsonRenderDockEntry>
export type JsonRenderDockRenderer = DockRenderer<DevframeJsonRenderDockEntry>
```

Type-only imports from `@devframes/hub/client`; `@devframes/hub` is already an
optional peer of json-render. json-render-ui's structural duplicates are
deleted and re-imported from here.

### 4. `@devframes/json-render-ui`: renderer module + node registration

- New browser bundle `dist/renderer/json-render.mjs` — self-contained ESM
  (Vue, `@json-render/vue`, design components bundled), default-exporting a
  ready `DockRenderer`. On mount it injects its compiled CSS (UnoCSS scan of
  its components + `@antfu/design` styles, generated at build time like
  hub-ui's `scripts/build-css.ts`) into `container.getRootNode()` — a
  `ShadowRoot` gets its own `<style>`, a document gets one in `<head>`;
  deduped per root. Dark rules scope to a `.dark` ancestor (the container
  class the viewer mirrors).
- New node-safe subpath `@devframes/json-render-ui/hub` exporting
  `jsonRenderUiRenderer(): DockRendererRegistration` (path to the prebuilt
  bundle). Type-only import from `@devframes/hub/initiate`; `@devframes/hub`
  becomes an optional peer (consumers of `./hub` have it by definition).

### 5. `@devframes/hub-ui`: delegate + fallback

- Delete `src/client/json-render/**` and
  `components/views/ViewJsonRender.vue` (+ stories). json-render-ui already
  covers the catalog with strictly better behavior (sanitizeSpec, action
  bridge with error surfacing, shared-state unsubscribe).
- `state/renderers.ts` delegates to hub's `createDockRenderersContext`,
  passing the `devframe:dock-renderers` manifest read in
  `createDocksContext`.
- `ViewEntry.vue`: natively-rendered types (`iframe`, `action`,
  `custom-render`, `launcher`, `group`, `~builtin`) keep their views; **every
  other type** routes to a new `ViewDockRenderer.vue` that mounts through the
  registry, mirrors the live `dark` class onto the container, and renders the
  fallback states: `missing-renderer` → muted icon + `No renderer for
  "<type>" in the current environment` + hint; `load-error` → error message +
  retry. Storybook story covers the fallback view.
- hub-ui drops `@json-render/core` / `@json-render/vue` dev deps; keeps the
  types-only `@devframes/json-render` peer (dock-union augmentation import in
  `types.ts`).

### 6. Examples & docs

- `hub-vite-minimal` / `hub-next-minimal` / `hub-rsbuild-minimal`: add
  `renderers: [jsonRenderUiRenderer()]` — the intended one-liner composition.
- `hub-vite` + `hub-next` witnesses: consume the manifest (replacing their
  compiled-in renderers) **and** demo the fallback with one unregistered dock
  type; parity maintained, READMEs updated.
- Docs: `docs/guide/build-your-own-hub-ui.md`,
  `docs/guide/build-your-own-json-render-frontend.md`; update
  `hub-initiate.md`, `client-context.md`, `json-render.md`; error pages for
  DF8108–DF8110; migration note in `migration-0.9.md`.

## Verification

`pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`, plus a
manual pass of `examples/hub-vite` (json-render dock renders via the manifest
module; an unregistered type shows the fallback) and the same in
`examples/hub-next`.
