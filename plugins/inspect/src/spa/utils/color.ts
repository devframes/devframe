export function getHashColorFromString(
  name: string,
  opacity: number | string = 1,
) {
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return getHsla(h, opacity)
}

export function getHsla(
  hue: number,
  opacity: number | string = 1,
) {
  // Using generic values suitable for dark theme, or maybe query a CSS variable for dark mode if we want
  const saturation = 60
  const lightness = 50
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`
}

export interface NamespaceSegment {
  /** The text of this segment. */
  text: string
  /** The separator that follows this segment (`:` or `/`), or `''` for the last one. */
  separator: string
  /** Whether this is the trailing segment — the function's own name rather than a namespace. */
  isLeaf: boolean
  /** Hash color for namespace segments; `undefined` for the leaf (rendered in the default foreground). */
  color?: string
}

/**
 * Split a namespaced function name (e.g. `my-plugin:do-thing`, `vite:rolldown:list`,
 * or `app/routes:get`) into segments, preserving the `:` / `/` separators between
 * them. Each namespace segment gets a stable hash color keyed on its cumulative
 * path, so the same namespace is always tinted the same way and nested namespaces
 * stay distinguishable. The trailing segment (the function's own name) is left
 * uncolored for contrast.
 */
export function parseNamespacedName(name: string): NamespaceSegment[] {
  const tokens = name.split(/([:/])/)
  const segments: NamespaceSegment[] = []
  let path = ''
  for (let i = 0; i < tokens.length; i += 2) {
    const text = tokens[i] ?? ''
    const separator = tokens[i + 1] ?? ''
    if (text === '' && separator === '')
      continue
    path += text
    const isLeaf = separator === ''
    segments.push({
      text,
      separator,
      isLeaf,
      color: isLeaf ? undefined : getHashColorFromString(path),
    })
    path += separator
  }
  return segments
}
