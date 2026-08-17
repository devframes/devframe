import type { HubInstance } from '@devframes/hub/initiate'
import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeChildProcessTerminalSession, DevframeViewLauncher } from '@devframes/hub/types'
import type { Buffer } from 'node:buffer'
import type { Plugin, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initHub } from '@devframes/hub/initiate'
import createTerminalsDevframe from '@devframes/plugin-terminals'
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
  { id: 'data-inspector', title: 'Data Inspector', icon: 'ph:database-duotone' },
  { id: 'og', title: 'Open Graph', icon: 'ph:image-square-duotone' },
  { id: 'messages', title: 'Messages', icon: 'ph:notification-duotone' },
]

// Repo root, resolved from this file (…/storybook/src/) so paths hold
// regardless of the process cwd.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
// Storybook's CLI entry — run with `node` so we don't depend on PATH/.bin.
const storybookBin = join(dirname(require.resolve('storybook/package.json')), 'dist/bin/dispatcher.js')

const pluginDir = (id: string): string => join(repoRoot, 'plugins', id)
const storybookConfigDir = (id: string): string => join(pluginDir(id), '.storybook')
const storybookStaticDir = (id: string): string => join(repoRoot, 'storybook', 'storybook-static', id)
const sessionIdFor = (id: string): string => `storybook:${id}`
const dockIdFor = (id: string): string => `sb-${id}`
const launchCommandFor = (id: string): string => `storybook:launch:${id}`

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*[A-Z]/gi

/** Last non-empty, ANSI-stripped line of a chunk — the launcher's `digest`. */
function lastLine(chunk: string): string | undefined {
  const lines = chunk.replace(ANSI, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.at(-1)
}

/** What the client needs to point a dock's iframe at the right place. */
type EnsureStorybookResult
  = | { ok: true, kind: 'port', port: number }
    | { ok: true, kind: 'path', url: string }
    | { ok: false, error: string }

export interface StorybookHubOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9787. */
  port?: number
}

/**
 * A Vite plugin that turns this package's Vite dev/preview server into a
 * devframe hub whose docks are the built-in plugins' Storybooks — plus the live
 * terminals plugin. It's the unified Storybook host, built as a devframe hub
 * rather than via Storybook Composition.
 *
 * Each Storybook is a first-class `type: 'launcher'` dock: a process-control
 * tile that starts its Storybook lazily, only when the user hits **Start**. The
 * launch button binds a `ctx.commands` command (`storybook:launch:<id>`), so a
 * viewer dispatches it over the serializable `hub:commands:execute` path. The
 * command:
 *
 *  - **dev** (`vite`): spawns the plugin's `storybook dev` through
 *    `ctx.terminals`, so the process lives as a read-only hub terminal session
 *    whose output streams into the Terminals dock. As it boots, the tail of
 *    that output is patched onto the launcher's `digest`, and the session id
 *    onto `terminalSessionId`; on ready the launcher flips to `success` and the
 *    command returns the live dev-server URL for the client to iframe (HMR).
 *  - **build** (`vite preview`): the launch resolves immediately to the
 *    pre-built `storybook/storybook-static/<id>` the hub serves on one origin.
 *
 * Either way the command returns an {@link EnsureStorybookResult}, so the
 * client swaps the launcher tile in place for the resolved iframe.
 */
export function storybookHub(options: StorybookHubOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let hub: HubInstance | undefined
  const devServers = new Map<string, { ready: Promise<number>, session: DevframeChildProcessTerminalSession }>()

  function killDevServers(): void {
    for (const { session } of devServers.values())
      void session.terminate().catch(() => {})
    devServers.clear()
  }

  /**
   * Spawn (once) the `storybook dev` server for a plugin and resolve when it
   * answers on its port. Concurrent callers await the same boot. The process
   * is owned by the hub's terminals subsystem (`ctx.terminals`), so it shows
   * up as a read-only session — proper title + icon, output streamed live —
   * in the Terminals dock. `reportDigest` receives the tail of that output so
   * the caller can surface boot progress on the launcher.
   */
  async function ensureDevServer(
    ctx: DevframeHubContext,
    meta: StorybookMeta,
    reportDigest?: (line: string) => void,
  ): Promise<number> {
    const existing = devServers.get(meta.id)
    if (existing)
      return existing.ready

    const port = await getPort({ port: 6100 + STORYBOOKS.findIndex(s => s.id === meta.id), random: true })
    const sessionId = sessionIdFor(meta.id)
    const title = `${meta.title} Storybook`

    // Drop a stale session left by a crashed/stopped previous run so the
    // stable id is free to re-register. (`remove` exists on the hub's
    // terminals host; the public interface doesn't surface it yet.)
    const stale = ctx.terminals.sessions.get(sessionId)
    if (stale)
      (ctx.terminals as unknown as { remove?: (s: typeof stale) => void }).remove?.(stale)

    const session = await ctx.terminals.startChildProcess(
      {
        command: process.execPath,
        args: [storybookBin, 'dev', '--config-dir', storybookConfigDir(meta.id), '--port', String(port), '--host', '0.0.0.0', '--no-open'],
        cwd: pluginDir(meta.id),
        env: { STORYBOOK_DISABLE_TELEMETRY: '1' },
      },
      {
        id: sessionId,
        title,
        description: `storybook dev · port ${port}`,
        icon: meta.icon,
      },
    )

    const child = session.getChildProcess()
    // Stream the tail of the boot output to the launcher's digest. The full
    // stream still lands in the Terminals dock via `ctx.terminals`.
    if (reportDigest) {
      const onData = (chunk: Buffer | string): void => {
        const line = lastLine(chunk.toString())
        if (line)
          reportDigest(line)
      }
      child?.stdout?.on('data', onData)
      child?.stderr?.on('data', onData)
    }
    const ready = new Promise<number>((resolvePort, reject) => {
      // Fail fast when the process dies before serving.
      child?.once('exit', (code) => {
        reject(new Error(`storybook dev exited before becoming ready (code ${code ?? 'null'})`))
      })
      waitForPort(port, 180_000).then(() => resolvePort(port), reject)
    })

    // Reflect the outcome on the hub terminal session (the hub does not
    // update a child-process session's status on its own exit).
    child?.on('exit', (code) => {
      devServers.delete(meta.id)
      if (ctx.terminals.sessions.has(sessionId))
        ctx.terminals.update({ id: sessionId, title, status: code === 0 ? 'stopped' : 'error' })
    })

    devServers.set(meta.id, { ready, session })
    return ready
  }

  async function startHub(server: ViteDevServer | PreviewServer, mode: 'dev' | 'build'): Promise<void> {
    await hub?.close().catch(() => {})
    hub = undefined
    killDevServers()

    const cwd = viteConfig?.root ?? process.cwd()

    // In build mode, serve each pre-built Storybook on the Vite server itself
    // — outside the hub base, so a launcher iframe resolves it on this origin.
    if (mode === 'build') {
      for (const meta of STORYBOOKS) {
        if (existsSync(storybookStaticDir(meta.id)))
          server.middlewares.use(`/__sb-${meta.id}/`, serveStaticNodeMiddleware(storybookStaticDir(meta.id)))
      }
    }

    hub = initHub({
      base,
      cwd,
      // Bind dual-stack (`::` accepts IPv6 + IPv4-mapped) so the side-car is
      // dialable via `::1`, `127.0.0.1`, and from outside the machine — the
      // default `localhost` bind resolves to `::1` only on some hosts, which
      // strands IPv4 clients and remote browsers.
      host: '::',
      auth: false,
      // Prefer 9787 but fall back to a free port when taken; the client
      // discovers whatever was chosen via `__connection.json`.
      ws: options.port != null ? { port: options.port } : { sidecar: true },
      getStorageDir(scope) {
        if (scope === 'workspace')
          return join(cwd, '.devframe')
        if (scope === 'project')
          return join(cwd, 'node_modules/.devframe-storybook')
        return join(homedir(), '.devframe-storybook')
      },
      // The live terminals plugin — a real integration docked alongside the
      // Storybooks, grouped separately so its "Terminals" reads apart from the
      // "Terminals" Storybook. It also mirrors the hub's `ctx.terminals`
      // sessions, so the spawned `storybook dev` processes appear inside it.
      devframes: [{ devframe: createTerminalsDevframe(), dock: { category: 'Plugins' } }],
      configure(context) {
        // Live launcher handles, so the launch command can patch each tile's
        // status/digest/terminalSessionId as the process boots.
        const launchers = new Map<string, { update: (patch: Partial<DevframeViewLauncher>) => void }>()

        /** The full launcher payload for a tile (patched wholesale — `update` shallow-merges). */
        const launcherState = (
          meta: StorybookMeta,
          patch: Partial<DevframeViewLauncher['launcher']>,
        ): DevframeViewLauncher['launcher'] => ({
          icon: meta.icon,
          title: `${meta.title} Storybook`,
          description: mode === 'build'
            ? `Open the pre-built ${meta.title} Storybook`
            : `Start the ${meta.title} plugin's Storybook dev server`,
          command: launchCommandFor(meta.id),
          buttonStart: mode === 'build' ? 'Open Storybook' : 'Start Storybook',
          buttonLoading: 'Starting…',
          status: 'idle',
          ...patch,
        })

        /**
         * The launch handler bound to each launcher's command. Spawns the dev
         * server through `ctx.terminals` (in dev), patches the tile as it
         * boots, and returns the resolved URL for the client to iframe in place.
         */
        const launchStorybook = async (meta: StorybookMeta): Promise<EnsureStorybookResult> => {
          const handle = launchers.get(meta.id)
          const patch = (p: Partial<DevframeViewLauncher['launcher']>): void =>
            handle?.update({ launcher: launcherState(meta, p) })

          if (mode === 'build') {
            if (!existsSync(storybookStaticDir(meta.id))) {
              const error = 'Storybook not built. Run `pnpm storybook:build` first.'
              patch({ status: 'error', error })
              return { ok: false, error }
            }
            patch({ status: 'success' })
            return { ok: true, kind: 'path', url: `/__sb-${meta.id}/` }
          }

          patch({ status: 'loading', digest: 'Starting Storybook dev server…' })
          try {
            const port = await ensureDevServer(context, meta, line =>
              patch({ status: 'loading', terminalSessionId: sessionIdFor(meta.id), digest: line }))
            patch({ status: 'success', terminalSessionId: sessionIdFor(meta.id), digest: `Ready on port ${port}` })
            return { ok: true, kind: 'port', port }
          }
          catch (error) {
            const message = (error as Error).message
            patch({ status: 'error', terminalSessionId: sessionIdFor(meta.id), error: message })
            return { ok: false, error: message }
          }
        }

        // One launcher dock per plugin Storybook, each bound to a command. A
        // viewer dispatches the command over `hub:commands:execute` (the
        // serializable path — the handler is stripped when the entry crosses
        // into shared state), and reads back the {@link EnsureStorybookResult}
        // to iframe the result.
        for (const meta of STORYBOOKS) {
          context.commands.register({
            id: launchCommandFor(meta.id),
            title: `${mode === 'build' ? 'Open' : 'Start'} ${meta.title} Storybook`,
            icon: meta.icon,
            category: 'Storybooks',
            handler: () => launchStorybook(meta),
          })
          launchers.set(meta.id, context.docks.register<DevframeViewLauncher>({
            id: dockIdFor(meta.id),
            title: meta.title,
            icon: meta.icon,
            category: 'Storybooks',
            type: 'launcher',
            launcher: launcherState(meta, { status: 'idle' }),
          }))
        }
      },
    })

    server.middlewares.use(hub.nodeMiddleware)

    server.httpServer?.once('close', () => {
      killDevServers()
      void hub?.close().catch(() => {})
    })
  }

  return {
    name: 'devframe-storybook-hub',

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
      await hub?.close().catch(() => {})
      hub = undefined
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
