import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The a11y inspector's Solid SPA extends the shared devframe design system for
// its tokens and Phosphor icons. The in-page agent bundle (src/inject) is
// deliberately excluded — it inlines its own styles into the host document.
export default defineConfig({
  presets: [presetDevframe()],
})
