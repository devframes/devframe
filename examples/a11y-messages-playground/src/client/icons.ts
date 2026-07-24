// @unocss-include
// Map dock `icon` strings (ph:*) to statically-extractable UnoCSS classes, so
// the offline Phosphor set renders without a runtime icon library. UnoCSS only
// emits classes it can see in source, hence the literal map.
const ICONS: Record<string, string> = {
  'ph:wheelchair-duotone': 'i-ph-wheelchair-duotone',
  'ph:notification-duotone': 'i-ph-notification-duotone',
}

/** Class chain for a dock icon, or `''` when unmapped (caller falls back). */
export function iconClass(name: string | undefined): string {
  return (name && ICONS[name]) ?? ''
}
