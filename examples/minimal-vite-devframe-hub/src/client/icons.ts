// @unocss-include
// Map a devframe dock `icon` (e.g. `ph:git-branch-duotone`) to a UnoCSS
// `preset-icons` class. Keeping the class strings literal lets UnoCSS
// statically extract them and inline only these glyphs from `@iconify-json/ph`
// at build time — the same icon strategy vite-devtools uses. Add a row here to
// support another dock icon.
const ICON_CLASS: Record<string, string> = {
  'ph:git-branch-duotone': 'i-ph-git-branch-duotone',
  'ph:terminal-window-duotone': 'i-ph-terminal-window-duotone',
  'ph:code-duotone': 'i-ph-code-duotone',
  'ph:stethoscope-duotone': 'i-ph-stethoscope-duotone',
  'ph:wheelchair-duotone': 'i-ph-wheelchair-duotone',
  'ph:rocket-duotone': 'i-ph-rocket-duotone',
  'ph:wrench-duotone': 'i-ph-wrench-duotone',
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
