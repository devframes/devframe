const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i

/**
 * Whether a client-script `importFrom` is a **bare module specifier** - an
 * npm-style name (`vite-plugin-vue-tracer/client/vite-devtools`) rather than
 * a URL the browser can resolve natively.
 */
export function isBareModuleSpecifier(specifier: string): boolean {
  const value = specifier.trim()
  return !!value
    && !value.startsWith('/')
    && !value.startsWith('./')
    && !value.startsWith('../')
    && !URL_SCHEME_RE.test(value)
}

/**
 * Resolve a dock client script's `importFrom` to the URL to import. URL
 * specifiers pass through untouched; a **bare** specifier resolves through
 * the explicit `resolveClientModule` callback (a viewer's own policy), then
 * the host-advertised `template` (`ConnectionMeta.configs.dock.clientModuleResolution`,
 * its `{specifier}` token replaced - e.g. Vite's `'/@id/{specifier}'`),
 * resolved against `metaBaseUrl` so it targets the host's origin from any
 * viewer. With neither, it stays unchanged - a page import map may still
 * cover it.
 */
export function resolveClientModuleSpecifier(specifier: string, options: {
  resolveClientModule?: (specifier: string) => string | undefined
  template?: string
  metaBaseUrl?: string
} = {}): string {
  if (!isBareModuleSpecifier(specifier))
    return specifier
  const custom = options.resolveClientModule?.(specifier)
  if (custom)
    return custom
  if (!options.template)
    return specifier
  const applied = options.template.includes('{specifier}')
    ? options.template.replaceAll('{specifier}', specifier)
    : options.template + specifier
  try {
    return new URL(applied, options.metaBaseUrl).href
  }
  catch {
    // No usable base (same-origin host page) - the browser resolves the
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
  // Bare and nothing resolved it - a host-capability gap, not a plugin bug.
  if (specifier === importFrom) {
    return ' - the specifier is a bare npm specifier and this host advertises no client-module resolution '
      + '(`ConnectionMeta.configs.dock.clientModuleResolution`). Serve the script as a self-contained '
      + 'bundle by URL, pass `resolveClientModule` to this client host, or run under a host that '
      + 'resolves bare specifiers (e.g. Vite: `/@id/{specifier}`).'
  }
  // Bare and resolved to a host URL, yet the import still failed - the host
  // couldn't actually serve the module (a dev server typically answers an
  // unresolvable module URL with its HTML fallback).
  return ` - the host resolved the bare specifier "${importFrom}" to this URL but could not serve the module. `
    + 'Check the package is installed and resolvable from the host project\'s root '
    + '(and built, if its exports point at build output).'
}
