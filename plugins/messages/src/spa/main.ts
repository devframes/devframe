import { mountMessages } from '../client/index'

// The shared design tokens flip on the `.dark` class; mirror the OS preference
// onto <html> (the other devframe plugins follow the same approach). The
// embeddable client mount leaves this to the host page — only the standalone
// SPA owns the document.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const app = document.getElementById('app')
if (!app)
  throw new Error('#app mount node missing from index.html')

mountMessages(app).catch((error) => {
  app.textContent = `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
})
