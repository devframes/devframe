import vitesseDark from '@shikijs/themes/vitesse-dark'
import vitesseLight from '@shikijs/themes/vitesse-light'
import shiki from 'comark/plugins/shiki'

// Aliased over `comark/plugins/rangi` (see `nuxt.config.ts` → `alias`) so the
// comark-docs layer's content pipeline highlights code with Shiki's
// vitesse-light / vitesse-dark themes instead of rangi + GitHub themes.
// The layer calls this with a rangi `{ theme }` option we intentionally ignore.
export default function rangiToShiki(_options?: unknown) {
  return shiki({
    registerDefaultThemes: false,
    themes: { light: vitesseLight, dark: vitesseDark },
  })
}
