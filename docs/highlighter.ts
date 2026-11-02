import vitesseDark from '@shikijs/themes/vitesse-dark'
import vitesseLight from '@shikijs/themes/vitesse-light'
import shiki from 'comark/plugins/shiki'

/** Code blocks in content: Shiki with the Vitesse themes instead of the layer's rangi and Geist theme. */
export default shiki({
  registerDefaultThemes: false,
  themes: { light: vitesseLight, dark: vitesseDark },
})
