import { defineConfig } from 'vite'
import { groupIconVitePlugin } from 'vitepress-plugin-group-icons'

export default defineConfig({
  plugins: [
    groupIconVitePlugin(),
  ],
})
