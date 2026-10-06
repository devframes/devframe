import type { Server } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOnboarding } from '@devframes/hub-ui-onboard'
import { defineConfig } from 'vite'

const cwd = fileURLToPath(new URL('.', import.meta.url))
const branding = { productName: 'Devframes on Vite', primaryColor: '#646cff' }

/**
 * Resolve from the project's own `package.json`, not from this file: the
 * packages were installed into the project a moment ago, and under pnpm
 * they are only reachable from there.
 */
const require = createRequire(join(cwd, 'package.json'))
function load<T>(specifier: string): Promise<T> {
  return import(pathToFileURL(require.resolve(specifier)).href)
}

/**
 * The whole integration: serve the onboarding routes, inject its button, and
 * once the hub is installed start it on the same base and HTTP server so the
 * button can swap itself for the real dock.
 */
function hubOnboarding(): Plugin {
  let server: ViteDevServer
  const onboarding = createOnboarding({
    cwd,
    packages: ['@devframes/hub', '@devframes/hub-ui', '@devframes/plugin-git'],
    branding,
    async onInstalled() {
      const [{ initHub }, { createUi }, { createGitDevframe }] = await Promise.all([
        load<typeof import('@devframes/hub/initiate')>('@devframes/hub/initiate'),
        load<typeof import('@devframes/hub-ui')>('@devframes/hub-ui'),
        load<typeof import('@devframes/plugin-git')>('@devframes/plugin-git'),
      ])
      const hub = initHub({
        base: '/__devframes/',
        cwd,
        // Vite's dev server is a plain `node:http` server unless `server.https` is set.
        server: server.httpServer as Server,
        ui: createUi({ branding }),
        devframes: [createGitDevframe()],
      })
      return hub.handler
    },
  })

  return {
    name: 'hub-onboarding',
    apply: 'serve',
    configureServer(instance) {
      server = instance
      instance.middlewares.use(onboarding.nodeMiddleware)
    },
    transformIndexHtml() {
      if (onboarding.disabled)
        return []
      return [{ tag: 'script', attrs: { type: 'module', src: onboarding.scriptSrc }, injectTo: 'body' }]
    },
  }
}

export default defineConfig({
  server: { allowedHosts: true, strictPort: false },
  plugins: [hubOnboarding()],
})
