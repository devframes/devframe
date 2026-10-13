import type { Plugin } from 'vite'
import type { OnboardingState, OnboardingStatus } from '../src/types'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { defaultMessages } from '../src/index'

const root = fileURLToPath(new URL('..', import.meta.url))
const productName = 'Devframes'

/**
 * A fake of the `__onboard/*` routes `createOnboarding` serves. The client
 * resolves them next to its own module (`/src/client/`). The playground page
 * picks the state through `/__mock/state`; Install runs a timer instead of a
 * package manager and ends in `installed` or `error`.
 */
function mockOnboarding(): Plugin {
  let state: OnboardingState = 'idle'
  let outcome: 'installed' | 'error' = 'installed'
  let timer: ReturnType<typeof setTimeout> | undefined

  const status = (): OnboardingStatus => ({
    state,
    command: ['pnpm', 'add', '-D', '@devframes/hub', '@devframes/hub-ui'],
    branding: { productName, primaryColor: '#646cff' },
    messages: defaultMessages(productName),
    error: state === 'error' ? { code: 'DF9001', message: 'Mock install failed.' } : undefined,
  })

  return {
    name: 'mock-onboarding',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const send = (body: unknown) => {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(body))
        }
        if (url.pathname === '/__mock/state') {
          clearTimeout(timer)
          state = (url.searchParams.get('state') ?? 'idle') as OnboardingState
          outcome = url.searchParams.get('outcome') === 'error' ? 'error' : 'installed'
          return send({ state, outcome })
        }
        if (!url.pathname.startsWith('/src/client/__onboard/'))
          return next()
        const route = url.pathname.split('/').pop()
        if (route === 'install') {
          state = 'installing'
          timer = setTimeout(() => (state = outcome), 2500)
        }
        else if (route === 'disable') {
          state = 'disabled'
        }
        send(route === 'status' ? status() : { ok: true })
      })
    },
  }
}

/**
 * The button's styles are compiled ahead of time into `.generated/css.ts`.
 * When a source file, `style.css` or a UnoCSS config changes, run the same
 * script `pnpm build:css` runs, then reload. The client is a self-running
 * module, so HMR would mount a second button: every change is a full reload.
 */
function rebuildCss(): Plugin {
  const watched = [
    fileURLToPath(new URL('../src/client/', import.meta.url)),
    fileURLToPath(new URL('../uno.config.ts', import.meta.url)),
    fileURLToPath(new URL('../../../design/', import.meta.url)),
  ]
  const generated = fileURLToPath(new URL('../src/client/.generated/', import.meta.url))
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    name: 'rebuild-onboard-css',
    configureServer(server) {
      server.watcher.add(watched)
      server.watcher.on('change', (file) => {
        if (file.startsWith(generated) || !watched.some(path => file.startsWith(path)))
          return
        clearTimeout(timer)
        timer = setTimeout(() => {
          const child = spawn('pnpm', ['run', 'build:css'], { cwd: root, stdio: 'inherit' })
          child.on('close', (code) => {
            if (code === 0)
              server.ws.send({ type: 'full-reload' })
          })
        }, 100)
      })
    },
    handleHotUpdate: ({ file }) => watched.some(path => file.startsWith(path)) ? [] : undefined,
  }
}

export default defineConfig({
  root,
  server: { open: '/playground/' },
  plugins: [mockOnboarding(), rebuildCss()],
})
