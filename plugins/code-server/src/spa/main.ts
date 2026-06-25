import { mountCodeServer } from '../client/index'
import 'virtual:uno.css'
import '@internal/design/theme.css'
import '../client/style.css'

const app = document.getElementById('app')
if (!app)
  throw new Error('#app mount node missing from index.html')

mountCodeServer(app).catch((error) => {
  app.textContent = `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
})
