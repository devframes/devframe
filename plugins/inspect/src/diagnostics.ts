import { defineDiagnostics } from 'nostics'

/**
 * Structured diagnostics for `@devframes/plugin-inspect`. Node-side only.
 * Codes use the plugin-private `DP_INSPECT_` band (see the built-in
 * plugins planning index) so they never collide with devframe core
 * (`DF00xx`) or `@devframes/hub` (`DF80xx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DP_INSPECT_0001: {
      why: (p: { name: string }) =>
        `Cannot invoke "${p.name}" — no RPC function with that name is registered on this connection.`,
      fix: 'Call `devframes:plugin:inspect:list-functions` to see the registered names, or check for a typo.',
    },
    DP_INSPECT_0002: {
      why: (p: { name: string, type: string }) =>
        `Refusing to invoke "${p.name}" — only read-only "query" and "static" functions are invokable from the inspector, but this one is "${p.type}".`,
      fix: 'The inspector deliberately blocks `action`/`event` functions to avoid triggering side effects. Invoke those through their own UI instead.',
    },
    DP_INSPECT_0003: {
      why: (p: { id: string }) =>
        `Cannot execute command "${p.id}" — this connection has no hub commands host.`,
      fix: 'Commands are a `@devframes/hub` feature. Mount this devframe inside a hub that registers commands via `ctx.commands.register()`, or check `devframes:plugin:inspect:list-commands` (returns an empty list outside a hub).',
    },
  },
})
