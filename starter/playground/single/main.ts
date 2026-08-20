import { mount } from '../../src/client/app.ts'
import { BASE_PATH } from '../../src/shared/base-path.ts'
import '../../src/client/styles.css'

// Mirrors `src/client/main.ts` (the real entry the CLI/build serve), except
// it points `connectDevframe` at the RPC bridge's mount base explicitly: this
// playground serves the SPA from Vite's own root for HMR, while
// `devframeViteBridge` (which claims 100% of requests under its own base -
// it can't share one with Vite's SPA serving) answers at `BASE_PATH`.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')

void mount(root, { baseURL: BASE_PATH })
