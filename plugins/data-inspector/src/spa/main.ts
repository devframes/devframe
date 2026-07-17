import { createApp } from 'vue'
import App from './App.vue'
import 'virtual:uno.css'
// floating-vue's base popper/transition structure, then @antfu/design's themed
// override (recolors the tooltip surface + arrow to the semantic tokens via
// `--at-apply`, so tooltips match the design system in light and dark).
import 'floating-vue/dist/style.css'
import '@antfu/design/styles/floating-vue.css'
import '@antfu/design/styles.css'
import './style.css'

createApp(App).mount('#app')
