import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { viteDevBridge } from 'devframe/helpers/vite'
import a11yDevframe, { a11yAgentBundlePath } from './index.ts'
import { A11Y_AGENT_PATH } from './shared/protocol.ts'

export type { ViteDevBridgeOptions }

/**
 * Mount the a11y inspector panel into an existing Vite dev server. In the
 * default static-mount mode it serves the built panel at
 * `/__devframe-a11y-inspector/`; pass `{ devMiddleware: true }` for the
 * bridge mode where the host owns the SPA and devframe runs a side-car
 * RPC + WS server.
 */
export function a11yVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(a11yDevframe, options)
}

export interface A11yAgentOptions {
  /**
   * Same-origin URL the agent bundle is served at and injected from.
   * Defaults to {@link A11Y_AGENT_PATH} (`/__df-inject/inject.js`).
   */
  path?: string
  /**
   * Auto-inject `<script type="module" src="{path}">` into the HTML Vite
   * serves (the host page). Set `false` to serve the bundle only and place
   * the tag yourself.
   */
  inject?: boolean
}

/**
 * Load the a11y inspector **agent** into a Vite host's own page so the
 * docked panel has something to scan. It serves the prebuilt agent bundle at
 * `options.path` and — unless `inject` is `false` — injects the module script
 * into the HTML Vite serves.
 *
 * Pair it with the panel: mount the a11y devframe definition as a dock (via a
 * hub's `mountDevframe`, or {@link a11yVitePlugin} standalone) so the panel
 * iframe and this agent share the Vite origin — that shared origin is what
 * lets their BroadcastChannel connect. Requires the built bundle
 * (`pnpm -C plugins/a11y build`).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function a11yAgent(options: A11yAgentOptions = {}): Plugin {
  const path = options.path ?? A11Y_AGENT_PATH
  const inject = options.inject ?? true
  let bundle: string | null = null

  return {
    name: 'devframe:a11y-agent',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(path, (_req: IncomingMessage, res: ServerResponse) => {
        if (bundle == null) {
          try {
            bundle = readFileSync(a11yAgentBundlePath, 'utf8')
          }
          catch {
            // Serve a hint (don't cache) so a later build is picked up, and a
            // browser-console note beats a silent 404 on the injected script.
          }
        }
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(bundle ?? agentMissingHint(path))
      })
    },
    transformIndexHtml() {
      if (!inject)
        return
      return [{ tag: 'script', attrs: { type: 'module', src: path }, injectTo: 'body' }]
    },
  }
}

/** A no-op ES module that explains, in the browser console, why the agent is absent. */
function agentMissingHint(path: string): string {
  return `console.warn('[devframe-a11y-inspector] agent bundle missing (served at ${path}). Run \`pnpm -C plugins/a11y build\` to generate dist/inject/inject.js.')`
}
