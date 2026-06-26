import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The hub UI extends the shared devframe design system — one preset carries the
// semantic token theme, the `df-*` component vocabulary, Phosphor icons, and the
// directive/variant-group transformers. Pair with `@internal/design/theme.css`
// (imported in `src/client/main.ts`).
export default defineConfig({
  presets: [presetDevframe()],
})
