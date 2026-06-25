import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

export default defineConfig({
  presets: [presetDevframe()],
  content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
})
