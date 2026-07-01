import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeHost } from 'devframe/types'
import type { ChildProcess } from 'node:child_process'
import type { Plugin, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import terminalsDevframe from '@devframes/plugin-terminals'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { startHttpAndWs } from 'devframe/node'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { dirname, join } from 'pathe'

/** A plugin whose Storybook this hub surfaces as its own dock. */
interface StorybookMeta {
  /** Plugin folder under `plugins/` and the `.storybook` config it owns. */
  id: string
  /** Dock title. */
  title: string
  /** Dock icon (mapped to a Phosphor glyph client-side). */
  icon: string
}

const STORYBOOKS: StorybookMeta[] = [
  { id: 'git', title: 'Git', icon: 'ph:git-branch-duotone' },
  { id: 'inspect', title: 'Inspect', icon: 'ph:magnifying-glass-duotone' },
  { id: 'code-server', title: 'Code Server', icon: 'ph:code-duotone' },
  { id: 'terminals', title: 'Terminals', icon: 'ph:terminal-window-duotone' },
  { id: 'a11y', title: 'A11y', icon: 'ph:person-arms-spread-duotone' },
]

// Repo root, resolved from this file (…/examples/storybook-hub/src/) so paths
// hold regardless of the process cwd.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
// Storybook's CLI entry — run with `node` so we don't depend on PATH/.bin.
const storybookBin = join(dirname(require.resolve('storybook/package.json')), 'dist/bin/dispatcher.js')

const pluginDir = (id: string): string => join(repoRoot, 'plugins', id)
const storybookConfigDir = (id: string): string => join(pluginDir(id), '.storybook')
const storybookStaticDir = (id: string): string => join(repoRoot, 'storybook', 'storybook-static', id)

/** What the client needs to point a dock's iframe at the right place. */
export type EnsureStorybookResult
  = | { ok: true, kind: 'port', port: number }
    | { ok: true, kind: 'path', url: string }
    | { ok: false, error: string }

// Read-side RPC so the UI can list hub messages (spawn progress, etc.).
const storybookHubMessagesList = defineHubRpcFunction({
  name: 'storybook-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

export interface StorybookHubOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9787. */
  port?: number
}

/**
 * A Vite plugin that turns a Vite dev/preview server into a devframe hub whose
 * docks are the built-in plugins' Storybooks — plus the live terminals plugin.
 *
 * Each Storybook dock's iframe is created lazily, only when the dock is first
 * opened (mirroring how the code-server plugin embeds its editor on demand):
 *
 *  - **dev** (`vite`): the plugin's `storybook dev` server is spawned on first
 *    open and the dock iframes it live (HMR).
 *  - **build** (`vite preview`): the pre-built `storybook/storybook-static/<id>`
 *    is served by the hub and the dock iframes that single origin.
 *
 * Both paths are unified behind the `storybook-hub:ensure` RPC, so the client
 * has one flow regardless of mode.
 */
export function storybookHub(options: StorybookHubOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let started: { close: () => Promise<void> } | undefined
  const devServers = new Map<string, { port: number, proc: ChildProcess, ready: Promise<number> }>()

  function killDevServers(): void {
    for (const { proc } of devServers.values())
      proc.kill()
    devServers.clear()
  }

  /**
   * Spawn (once) the `storybook dev` server for a plugin and resolve when it
   * answers on its port. Concurrent callers await the same boot.
   */
  async function ensureDevServer(ctx: DevframeHubContext, meta: StorybookMeta): Promise<number> {
    const existing = devServers.get(meta.id)
    if (existing)
      return existing.ready

    const port = await getPort({ port: 6100 + STORYBOOKS.findIndex(s => s.id === meta.id), random: true })
    const cwd = pluginDir(meta.id)
    const proc = spawn(
      process.execPath,
      [storybookBin, 'dev', '--config-dir', storybookConfigDir(meta.id), '--port', String(port), '--host', '0.0.0.0', '--no-open', '--quiet'],
      { cwd, env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1' }, stdio: 'inherit' },
    )
    proc.on('exit', () => devServers.delete(meta.id))

    void ctx.messages.add({
      level: 'info',
      message: `Starting ${meta.title} Storybook…`,
      description: `storybook dev on port ${port}`,
    })

    const ready = waitForPort(port, 180_000).then(() => {
      void ctx.messages.add({ level: 'success', message: `${meta.title} Storybook ready`, description: `port ${port}` })
      return port
    })
    devServers.set(meta.id, { port, proc, ready })
    return ready
  }

  async function startHub(server: ViteDevServer | PreviewServer, mode: 'dev' | 'build'): Promise<void> {
    await started?.close().catch(() => {})
    started = undefined
    killDevServers()

    const cwd = viteConfig?.root ?? process.cwd()
    const port = options.port ?? await getPort({ port: 9787, random: false })

    const serveConnectionMeta = (metaBase: string): void => {
      server.middlewares.use(`${metaBase}${DEVFRAME_CONNECTION_META_FILENAME}`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ backend: 'websocket', websocket: port }))
      })
    }

    const host: DevframeHost = {
      mountStatic(mountBase, distDir) {
        server.middlewares.use(mountBase, serveStaticNodeMiddleware(distDir))
      },
      mountConnectionMeta(metaBase) {
        serveConnectionMeta(metaBase)
      },
      resolveOrigin() {
        const resolved = server.resolvedUrls?.local?.[0]
        return resolved ? new URL(resolved).origin : 'http://localhost:5173'
      },
      getStorageDir(scope) {
        return scope === 'workspace'
          ? join(cwd, 'node_modules/.storybook-hub')
          : join(homedir(), '.storybook-hub')
      },
    }

    // Ensure a Storybook is reachable and hand its URL back to the client. In
    // dev this spawns the plugin's `storybook dev` on demand; in build it points
    // at the pre-built static bundle the hub serves.
    const storybookHubEnsure = defineHubRpcFunction({
      name: 'storybook-hub:ensure',
      type: 'action',
      jsonSerializable: true,
      setup: (ctx: DevframeHubContext) => ({
        async handler(input?: { id?: string }): Promise<EnsureStorybookResult> {
          const meta = STORYBOOKS.find(s => s.id === input?.id)
          if (!meta)
            return { ok: false, error: `Unknown storybook "${input?.id}"` }

          if (mode === 'build') {
            if (!existsSync(storybookStaticDir(meta.id)))
              return { ok: false, error: 'Storybook not built. Run `pnpm storybook:build` first.' }
            return { ok: true, kind: 'path', url: `/__sb-${meta.id}/` }
          }

          try {
            return { ok: true, kind: 'port', port: await ensureDevServer(ctx, meta) }
          }
          catch (error) {
            return { ok: false, error: (error as Error).message }
          }
        },
      }),
    })

    const context = await createHubContext({
      cwd,
      workspaceRoot: cwd,
      mode,
      host,
      builtinRpcDeclarations: [storybookHubEnsure, storybookHubMessagesList],
    })

    // In build mode, serve each pre-built Storybook so its dock iframe resolves
    // on this single origin.
    if (mode === 'build') {
      for (const meta of STORYBOOKS) {
        if (existsSync(storybookStaticDir(meta.id)))
          context.views.hostStatic(`/__sb-${meta.id}/`, storybookStaticDir(meta.id))
      }
    }

    // One dock per plugin Storybook. `url` is only the build-mode static path;
    // the client routes these through `storybook-hub:ensure`, so in dev it is
    // superseded by the spawned dev-server URL.
    for (const meta of STORYBOOKS) {
      context.docks.register({
        id: `sb-${meta.id}`,
        title: meta.title,
        icon: meta.icon,
        category: 'Storybooks',
        type: 'iframe',
        url: `/__sb-${meta.id}/`,
      })
    }

    // The live terminals plugin — a real integration docked alongside the
    // Storybooks, grouped separately so its "Terminals" reads apart from the
    // "Terminals" Storybook.
    await mountDevframe(context, terminalsDevframe, { dock: { category: 'Plugins' } })

    context.commands.register({
      id: 'storybook-hub:ping',
      title: 'Storybook Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
    await context.messages.add({
      level: 'success',
      message: 'Storybook Hub started',
      description: `${mode} mode · side-car WS on port ${port} · ${STORYBOOKS.length} Storybook dock(s).`,
    })

    started = await startHttpAndWs({ context, port, auth: false })
    serveConnectionMeta(base)

    server.httpServer?.once('close', () => {
      killDevServers()
      void started?.close().catch(() => {})
    })
  }

  return {
    name: 'storybook-hub',

    configResolved(config) {
      viteConfig = config
    },

    // `vite` (dev): Storybooks are spawned on demand.
    async configureServer(server) {
      await startHub(server, 'dev')
    },

    // `vite preview` (after `vite build`): Storybooks are served static.
    async configurePreviewServer(server) {
      await startHub(server, 'build')
    },

    async closeBundle() {
      killDevServers()
      await started?.close().catch(() => {})
      started = undefined
    },
  }
}

/** Poll `iframe.html` until the Storybook dev server answers, or time out. */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const url = `http://127.0.0.1:${port}/iframe.html`
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok)
        return
    }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Storybook dev server on port ${port} did not become ready within ${Math.round(timeoutMs / 1000)}s`)
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
