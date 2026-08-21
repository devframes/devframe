import { mount } from './app.ts'
import './styles.css'

// Mirror the OS color scheme onto <html> so the CSS `.dark` variables apply.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')

void mount(root)
