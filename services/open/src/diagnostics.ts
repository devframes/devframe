import { defineDiagnostics } from 'devframe/utils/nostics'

// Uses the service's own `DS_OPEN_` prefix per the built-in convention,
// keeping it collision-free with devframe core (`DF00xx`), the hub
// (`DF8xxx`), and the plugins (`DP_<SLUG>_`).
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DS_OPEN_0002: {
      why: (p: { path: string }) => `Refusing to open "${p.path}": the path is outside the workspace root and every configured extra root.`,
      fix: 'The open service only touches files under the workspace root by default. Pass additional allowed directories via the service\'s `roots` option when your tool manages files elsewhere (e.g. a global storage dir).',
    },
  },
})
