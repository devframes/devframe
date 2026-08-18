import type { ConnectionMeta } from 'devframe/types'

/** Token a {@link DockConnectionConfig.clientModuleResolution} template replaces with the bare specifier. */
export const CLIENT_MODULE_SPECIFIER_TOKEN = '{specifier}'

const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i

/**
 * Whether a client-script `importFrom` is a **bare module specifier** — an
 * npm-style name (`vite-plugin-vue-tracer/client/vite-devtools`) rather than a
 * URL the browser can resolve natively (root-relative, dot-relative,
 * protocol-relative, or carrying a URL scheme).
 */
export function isBareModuleSpecifier(specifier: string): boolean {
  const value = specifier.trim()
  if (!value)
    return false
  return !value.startsWith('/')
    && !value.startsWith('./')
    && !value.startsWith('../')
    && !URL_SCHEME_RE.test(value)
}

export interface ResolveClientModuleSpecifierOptions {
  /**
   * Explicit resolver — wins over the host-advertised template. Return a URL
   * to import instead, or `undefined` to fall through to the template.
   */
  resolveClientModule?: (specifier: string) => string | undefined
  /**
   * The connection meta carrying the host-declared
   * `configs.dock.clientModuleResolution` template.
   */
  connectionMeta?: ConnectionMeta
  /**
   * Absolute URL of the `__connection.json` that produced `connectionMeta`.
   * A relative template result resolves against it, so an external viewer on
   * another origin still imports from the host that declared the template.
   */
  metaBaseUrl?: string
}

/**
 * Apply a host's client-module resolution template to a bare specifier:
 * replace the `{specifier}` token (or suffix the specifier onto a token-less
 * template). The result is a URL path on the host — e.g. Vite's
 * `'/@id/{specifier}'` template maps `foo/bar` to `/@id/foo/bar`, which routes
 * through Vite's own module graph.
 */
export function applyClientModuleResolutionTemplate(template: string, specifier: string): string {
  return template.includes(CLIENT_MODULE_SPECIFIER_TOKEN)
    ? template.replaceAll(CLIENT_MODULE_SPECIFIER_TOKEN, specifier)
    : template + specifier
}

/**
 * Resolve a dock client script's `importFrom` to the URL the client host
 * should import. URL specifiers pass through untouched; a **bare** specifier
 * resolves through, in order:
 *
 * 1. the explicit {@link ResolveClientModuleSpecifierOptions.resolveClientModule}
 *    option (a viewer's own policy),
 * 2. the host-advertised template
 *    (`ConnectionMeta.configs.dock.clientModuleResolution`), resolved against
 *    `metaBaseUrl` so it targets the host's origin from any viewer,
 * 3. unchanged — the native import may still succeed if the page carries an
 *    import map for it.
 */
export function resolveClientModuleSpecifier(
  specifier: string,
  options: ResolveClientModuleSpecifierOptions = {},
): string {
  if (!isBareModuleSpecifier(specifier))
    return specifier

  const custom = options.resolveClientModule?.(specifier)
  if (custom)
    return custom

  const template = options.connectionMeta?.configs?.dock?.clientModuleResolution
  if (!template)
    return specifier

  const applied = applyClientModuleResolutionTemplate(template, specifier)
  try {
    return new URL(applied, options.metaBaseUrl).href
  }
  catch {
    // No usable base (same-origin host page) — let the browser resolve the
    // root-relative result against the page origin.
    return applied
  }
}

/**
 * Diagnose a failed client-script import: name the likely cause instead of
 * leaving only the browser's opaque `TypeError`. `importFrom` is the entry's
 * declared specifier, `specifier` what was actually imported (after
 * {@link resolveClientModuleSpecifier}).
 */
export function clientScriptFailureHint(importFrom: string, specifier: string): string {
  if (!isBareModuleSpecifier(importFrom))
    return ''
  // Bare and nothing resolved it — a host-capability gap, not a plugin bug.
  if (specifier === importFrom) {
    return ' — the specifier is a bare npm specifier and this host advertises no client-module resolution '
      + '(`ConnectionMeta.configs.dock.clientModuleResolution`). Serve the script as a self-contained '
      + 'bundle by URL, pass `resolveClientModule` to this client host, or run under a host that '
      + 'resolves bare specifiers (e.g. Vite: `/@id/{specifier}`).'
  }
  // Bare and resolved to a host URL, yet the import still failed — the host
  // couldn't actually serve the module. (A dev server typically answers an
  // unresolvable module URL with its HTML fallback, which the browser reports
  // as "Failed to fetch dynamically imported module".)
  return ` — the host resolved the bare specifier "${importFrom}" to this URL but could not serve the module. `
    + 'Check the package is installed and resolvable from the host project\'s root '
    + '(and built, if its exports point at build output).'
}
