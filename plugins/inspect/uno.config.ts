import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The inspector extends the shared devframe design system (tokens, `df-*`
// vocabulary, Phosphor icons). Its Vue templates are scanned by default; `.ts`
// is opted in for any class strings authored in composables/helpers.
export default defineConfig({
  presets: [presetDevframe()],
  content: {
    pipeline: {
      include: [/\.(?:vue|[cm]?[jt]sx?|html)($|\?)/],
    },
  },
})
