# Build Your Own JSON-Render Frontend

`@devframes/json-render-ui` is the reference frontend, not the protocol — any
implementation of the renderer contract replaces it, in any framework. The
[Next hub witness](/examples/hub-next) ships a complete React one in two files
(`src/client/json-render/`); this page is the contract it implements.

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

Resolve the entry's serializable `view` reference:

- `{ stateKey }` — subscribe to that shared state via
  `context.rpc.sharedState.get(stateKey)`, render its value as the live spec,
  and re-render on `'updated'`. **Unsubscribe in `dispose`.**
- `{ spec }` — render the embedded spec directly; no shared state involved.

Detect static output via `context.rpc.connectionMeta.backend === 'static'` and
disable action dispatch there.

## Behavior expectations

Match the reference frontend's semantics so specs behave identically across
frontends:

- **Actions** — a spec action name dispatches an RPC call of the same name.
  Never bridge the reserved built-ins (`setState`, `pushState`, `removeState`,
  `validateForm` — handled by the upstream renderer) or promise probes
  (`then`/`catch`/`finally`). Surface failures to the view rather than
  swallowing them.
- **Validation** — validate element props against `basePropSchemas` from
  `@devframes/json-render`; swap an invalid element for an error placeholder so
  one bad element doesn't break the view.
- **Unknown components** — a component your registry lacks renders as a
  placeholder (type + prop-key gist) with a `console.warn`; the rest of the
  view renders.
- **State reset** — reseed spec state only when the view identity changes, not
  on every spec update.

## Plugging it in

Two seams, one contract:

- **Local registration** — a host page that bundles its own client passes
  `createDevframeClientHost({ renderers: { 'json-render': myRenderer } })`.
  Local registrations win over the manifest.
- **A prebuilt renderer module** — bundle your renderer as one self-contained
  browser ES module (framework and styles included) whose default export is the
  renderer, and ship a node helper returning the hub registration:

  ```ts
  import type { DockRendererRegistration } from '@devframes/hub/initiate'

  export function myRenderer(): DockRendererRegistration {
    return { type: 'json-render', file: myPrebuiltModulePath }
  }
  ```

  Hosts compose it with `initHub({ renderers: [myRenderer()] })` — the hub
  serves the module and every viewer imports it lazily (see [renderer
  modules](./hub-initiate#renderer-modules)).

A prebuilt module must be **self-styling and shadow-root-safe**: the viewer's
container may live inside a shadow root, so deliver your stylesheet into the
mount subtree (the reference module attaches its own shadow root inside the
container and injects its compiled CSS there). Read the theme from the live
`dark` class the viewer keeps on the container, and derive brand color from the
inherited `--devframe-primary` custom property when present.
