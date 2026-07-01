import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import { storybookHub } from './src/storybook-hub'

export default defineConfig({
  resolve: { alias },
  plugins: [
    UnoCSS(),
    storybookHub(),
  ],
})
