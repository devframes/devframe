import { defineDiagnostics } from 'devframe/utils/nostics'

/**
 * Structured diagnostics for `@devframes/plugin-messages`. Node-side only.
 * Codes use the plugin-private `DP_MESSAGES_` band (see the built-in
 * plugins planning index) so they never collide with devframe core
 * (`DF00xx`) or `@devframes/hub` (`DF80xx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DP_MESSAGES_0001: {
      why: (p: { id: string }) =>
        `"${p.id}" is mounted on a context without a hub messages host (\`ctx.messages\`); its RPC surface stays registered but no-ops, so the panel will show an empty feed.`,
      fix: 'Mount this devframe through a hub host (`@devframes/hub`\'s `initHub`, or `createHubContext` + `ctx.install`) to get a live message feed.',
    },
  },
})
