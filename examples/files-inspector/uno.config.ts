import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// This example's Preact SPA extends the shared devframe design system for its
// tokens, `df-*` vocabulary and Phosphor icons — matching the built-in plugins.
export default defineConfig({
  presets: [presetDevframe()],
  content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
})
