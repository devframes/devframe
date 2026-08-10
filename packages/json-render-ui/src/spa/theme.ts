// Color-scheme + brand theming for the provider SPA, shared same-origin with
// the host. Dark/light follows the `devframes-color-scheme` localStorage key
// (the hub writes it; falls back to the OS preference), and the brand primary
// comes from the hub's `branding.json`. Both are best-effort: run standalone
// (no hub, no key, no branding.json) and it simply uses the OS scheme and the
// default devframe palette.

const COLOR_SCHEME_KEY = 'devframes-color-scheme'
type ColorSchemePreference = 'auto' | 'light' | 'dark'

function readPreference(): ColorSchemePreference {
  try {
    const value = localStorage.getItem(COLOR_SCHEME_KEY)
    if (value === 'light' || value === 'dark' || value === 'auto')
      return value
  }
  catch {
    // localStorage can throw in sandboxed frames — fall back to auto.
  }
  return 'auto'
}

/**
 * Mirror the host's color scheme onto `.dark`, following the shared
 * `devframes-color-scheme` key (cross-frame via `storage` events) and the OS
 * preference when unset.
 */
export function initColorScheme(): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const preference = readPreference()
    const dark = preference === 'auto' ? mq.matches : preference === 'dark'
    document.documentElement.classList.toggle('dark', dark)
  }
  apply()
  mq.addEventListener('change', apply)
  window.addEventListener('storage', (e) => {
    if (e.key === COLOR_SCHEME_KEY || e.key === null)
      apply()
  })
}

/**
 * Apply the host's brand primary by fetching `branding.json` (published by the
 * hub's `createUi({ branding })` at the hub base). The provider SPA is mounted
 * one segment under that base (`<base><id>/`), so try one level up first, then a
 * sibling; silently skip when unbranded.
 */
export async function applyBranding(): Promise<void> {
  for (const rel of ['../branding.json', './branding.json']) {
    try {
      const res = await fetch(new URL(rel, document.baseURI))
      if (!res.ok)
        continue
      const branding = await res.json() as { primaryColor?: string }
      if (branding && typeof branding.primaryColor === 'string')
        document.documentElement.style.setProperty('--devframe-primary', branding.primaryColor)
      return
    }
    catch {
      // Try the next candidate; unbranded/standalone use falls through.
    }
  }
}
