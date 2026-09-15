/// <reference types="vite/client" />

import { syncPanelTheme } from '../../../design/panel-theme'
import { mountTerminals } from './client/index'

const app = document.getElementById('app')
if (!app)
  throw new Error('#app mount node missing from index.html')

mountTerminals(app).catch((error) => {
  app.textContent = `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
})

const stopPanelTheme = syncPanelTheme()
import.meta.hot?.dispose(stopPanelTheme)
