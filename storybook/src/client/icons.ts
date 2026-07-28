// @unocss-include
// Map a devframe dock `icon` (e.g. `ph:git-branch-duotone`) to a UnoCSS
// `preset-icons` class. Keeping the class strings literal lets UnoCSS
// statically extract them and inline only these glyphs from `@iconify-json/ph`
// at build time. Add a row here to support another dock icon.
const ICON_CLASS: Record<string, string> = {
  'ph:git-branch-duotone': 'i-ph-git-branch-duotone',
  'ph:magnifying-glass-duotone': 'i-ph-magnifying-glass-duotone',
  'ph:code-duotone': 'i-ph-code-duotone',
  'ph:terminal-window-duotone': 'i-ph-terminal-window-duotone',
  'ph:person-arms-spread-duotone': 'i-ph-person-arms-spread-duotone',
  'ph:books-duotone': 'i-ph-books-duotone',
  'ph:plug-duotone': 'i-ph-plug-duotone',
}

/**
 * Resolve a dock icon to its UnoCSS class, or an empty string when the icon
 * isn't mapped (the caller falls back to a text initial).
 */
export function iconClass(name: string | { light: string, dark: string } | undefined): string {
  if (!name)
    return ''
  const id = typeof name === 'string' ? name : name.light
  return ICON_CLASS[id] ?? ''
}
