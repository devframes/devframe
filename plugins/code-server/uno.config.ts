import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The code-server launcher extends the shared devframe design system. The SPA
// and Storybook generate CSS from this config; the library emits `df-*`
// classes and relies on the host page providing the matching stylesheet.
//
// The launcher view is hand-written vanilla TS, so `.ts` is opted into the
// extraction pipeline (UnoCSS scans framework files only by default).
export default defineConfig({
  presets: [presetDevframe()],
  content: {
    pipeline: {
      include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/],
    },
  },
})
