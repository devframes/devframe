import type { DevframeBranding } from '../packages/hub-ui/src/types'
import { setupDevframeConnection } from 'devframe/client'

/** Apply startup branding to a built-in devframe's iframe SPA. */
export function applyPanelBranding(): () => void {
  if (window.parent === window)
    return () => {}

  const root = document.documentElement
  const previous = root.style.getPropertyValue('--devframe-primary')
  const priority = root.style.getPropertyPriority('--devframe-primary')
  let disposed = false
  let applied = false

  void setupDevframeConnection().then(({ connectionMeta }) => {
    const configs = connectionMeta.configs as { ui?: { branding?: DevframeBranding } } | undefined
    const color = configs?.ui?.branding?.primaryColor
    if (disposed || !color || !CSS.supports('color', color))
      return
    root.style.setProperty('--devframe-primary', color)
    applied = true
  }).catch(() => {
    // Connection failures leave the SPA's default palette intact.
  })

  return () => {
    disposed = true
    if (!applied)
      return
    if (previous)
      root.style.setProperty('--devframe-primary', previous, priority)
    else
      root.style.removeProperty('--devframe-primary')
  }
}
