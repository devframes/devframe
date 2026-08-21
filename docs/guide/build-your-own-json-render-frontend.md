# Build Your Own JSON-Render Frontend

`@devframes/json-render-ui` is the reference frontend, not the protocol — any
implementation of the renderer contract replaces it, in any framework. This page
is that contract; the [Next hub witness](/examples/hub-next) ships a React one
(`src/client/json-render/`).

## The contract

`@devframes/json-render/hub` owns the types:

```ts
import type { JsonRenderDockRenderer } from '@devframes/json-render/hub'

// a hub DockRenderer narrowed to the json-render dock entry
const renderer: JsonRenderDockRenderer = async ({ entry, container, context }) => {
  // mount your framework's root into `container`, render `entry.view`
  return { dispose() { /* unmount, unsubscribe */ } }
}
```

Resolve the entry's `view` reference:

- `{ stateKey }` — subscribe via `context.rpc.sharedState.get(stateKey)`, render
  its value as the live spec, re-render on `'updated'`. **Unsubscribe in `dispose`.**
- `{ spec }` — render the embedded spec directly.

Detect static output via `context.rpc.connectionMeta.backend === 'static'` and
disable action dispatch there.

## Behavior expectations

Match the reference frontend's semantics:

- **Actions** — a spec action name dispatches an RPC call of the same name.
  Never bridge the reserved built-ins (`setState`, `pushState`, `removeState`,
  `validateForm` — handled upstream) or promise probes
  (`then`/`catch`/`finally`). Surface failures to the view.
- **Validation** — validate element props against `basePropSchemas` from
  `@devframes/json-render`; swap an invalid element for an error placeholder.
- **Unknown components** — a component your registry lacks renders as a
  placeholder (type + prop-key gist) with a `console.warn`; the rest renders.
- **State reset** — reseed spec state only when the view identity changes, not
  on every spec update.

## Plugging it in

Two seams:

- **Local registration** — a host page bundling its own client passes
  `createDevframeClientHost({ renderers: { 'json-render': myRenderer } })`.
  Local registrations win over the manifest.
- **A prebuilt renderer module** — bundle your renderer as one self-contained
  browser ES module (framework and styles included) whose default export is the
  renderer, plus a node helper returning the registration:

  ```ts
  import type { DockRendererRegistration } from '@devframes/hub/initiate'

  export function myRenderer(): DockRendererRegistration {
    return { type: 'json-render', file: myPrebuiltModulePath }
  }
  ```

  Hosts compose it with `initHub({ renderers: [myRenderer()] })`; the hub serves
  the module and every viewer imports it lazily (see [renderer
  modules](./hub-initiate#renderer-modules)).

A prebuilt module must be **self-styling and shadow-root-safe**: the container
may live inside a shadow root, so deliver your stylesheet into the mount subtree.
Read the theme from the live `dark` class on the container, and derive brand
color from the inherited `--devframe-primary` property.
