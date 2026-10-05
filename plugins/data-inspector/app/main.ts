/// <reference types="vite/client" />

import { createApp } from 'vue'
import { applyPanelBranding } from '../../../design/panel-theme'
import App from './App.vue'
import 'virtual:uno.css'
// vue-afloat's base popper structure; `@antfu/design/styles.css` below themes
// it through the `--vue-afloat-*` variables so tooltips match the design
// system in light and dark.
import 'vue-afloat/style.css'
import '@antfu/design/styles.css'
import './style.css'
import '../../../design/primary-ramp.css'

createApp(App).mount('#app')

const stopPanelTheme = applyPanelBranding()
import.meta.hot?.dispose(stopPanelTheme)
