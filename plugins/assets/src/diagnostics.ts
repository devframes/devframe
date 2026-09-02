import { defineDiagnostics } from 'devframe/utils/nostics'

/**
 * Uses the plugin's own `DP_ASSETS_` prefix per the built-in plugin
 * convention, keeping it collision-free with devframe core (`DF`) and the
 * hub (`DF8xxx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DP_ASSETS_0001: {
      why: (p: { path: string }) => `"${p.path}" resolves outside the managed directory.`,
      fix: 'Use a path relative to the configured `dir`, without leading `/` or `..` segments.',
    },
    DP_ASSETS_0002: {
      why: (p: { path: string, extension: string, allowed: readonly string[] }) => `Cannot upload "${p.path}" because the "${p.extension}" extension is not allowed. Allowed extensions: ${p.allowed.join(', ')}.`,
      fix: 'Configure `uploadExtensions` on the assets devframe to allow this extension, or pass `\'*\'` to allow any.',
    },
    DP_ASSETS_0003: {
      why: (p: { path: string }) => `Cannot rename to "${p.path}" because a file already exists there.`,
      fix: 'Choose a different name.',
    },
    DP_ASSETS_0004: {
      why: (p: { path: string }) => `No asset found at "${p.path}".`,
      fix: 'Refresh the asset list - it may have been moved or deleted already.',
    },
    DP_ASSETS_0005: {
      why: (p: { path: string }) => `Cannot create folder "${p.path}" because a file already exists there.`,
      fix: 'Choose a different folder name.',
    },
    DP_ASSETS_0006: {
      why: (p: { name: string }) => `"${p.name}" is not a valid file name.`,
      fix: 'Names must be non-empty and cannot contain `/` or `\\`.',
    },
    DP_ASSETS_0007: {
      why: 'The upload streaming channel is unavailable because this devframe was set up with `write: false`.',
      fix: 'This indicates an internal registration bug - `upload` should never be reachable without `write: true`. Please report it.',
    },
  },
})
