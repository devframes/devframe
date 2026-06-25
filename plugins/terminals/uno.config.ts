import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The terminals panel extends the shared devframe design system — one preset
// carries the token theme, the `df-*` component vocabulary, Phosphor icons, and
// the directive/variant-group transformers. Pair with `@internal/design/theme.css`.
export default defineConfig({
  presets: [presetDevframe()],
})
