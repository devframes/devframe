import { mergeConfigs, presetWind3 } from 'unocss'
import { createDesignConfig, shadowSurfaceSafelist } from '../../design/uno.config'

/**
 * Same shared design base as `@devframes/hub-ui`, on Wind3 because the
 * stylesheet is adopted into a shadow root (see `design/uno.config.ts`).
 * Compiled ahead of time by `scripts/build-css.ts`.
 */
export default mergeConfigs([
  createDesignConfig({ base: presetWind3() }),
  {
    safelist: shadowSurfaceSafelist,
    content: {
      pipeline: {
        include: [/\.ts$/],
      },
    },
    shortcuts: {
      'bg-dock-glass': 'bg-glass dark:bg-[#111]/80',
      'z-floating-anchor': 'z-[2147483644]',
    },
  },
])
