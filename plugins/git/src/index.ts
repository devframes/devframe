// Types-only: loads service-git's registry augmentation so
// `ctx.services.get('@devframes/service-git')` is typed in `rpc.snapshot`.
import type {} from '@devframes/service-git'
import type { DevframeDefinition, RemoteAssets } from 'devframe'
import process from 'node:process'
import { defineDevframe } from 'devframe'
import { resolve } from 'pathe'
import pkg from '../package.json' with { type: 'json' }

// The Next.js static-export SPA ships in the lockstep
// `@devframes/plugin-git--assets` package, served on demand through devframe's
// remote-assets back-proxy. The definition's `importMetaUrl` (below) supplies
// the default `resolveFrom`, so a locally installed copy (a workspace link
// here) is served with zero network.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

const GIT_SERVICE = '@devframes/service-git'

export interface GitDevframeOptions {
  /** Repository directory to inspect. Defaults to the devframe `cwd`. */
  repoRoot?: string
  /**
   * Mount path override. Left to the adapter by default: `/` for standalone
   * (cli / build / spa), `/__devframes_plugin_git/` for hosted (vite / embedded).
   */
  basePath?: string
  /** SPA dist directory. Defaults to the package's bundled SPA. */
  distDir?: string
  /** Preferred dev-server port (default 9710). */
  port?: number
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — `--open` embeds the current OTP in the opened URL, so the
   * tab authenticates automatically without extra prompts. Hosted adapters
   * manage their own auth and ignore this.
   */
  auth?: boolean
}

/**
 * Create the Git dashboard devframe. All git work runs through the
 * `@devframes/service-git` wire service (declared below); the SPA calls its
 * `devframes:service:git:*` RPC directly. Mount it into any host via
 * devframe's adapters, or run it standalone with the bundled CLI
 * (`devframe-git`).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createGitDevframe(options: GitDevframeOptions = {}): DevframeDefinition {
  const distDir = options.distDir ?? remoteAssets
  // Resolved at factory time (process.cwd() here equals the adapter's ctx.cwd)
  // so it can ride the declarative service descriptor; omit to let the service
  // default to the context cwd.
  const cwd = options.repoRoot ? resolve(process.cwd(), options.repoRoot) : undefined

  return defineDevframe({
    id: 'devframes_plugin_git',
    name: 'Git',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: 'ph:git-branch-duotone',
    basePath: options.basePath,
    cli: {
      command: 'devframe-git',
      port: options.port ?? 9710,
      distDir,
      // Gate the standalone server by default; `maybeOpenBrowser` folds the
      // current OTP into the `--open` URL so the tab lands already trusted.
      auth: options.auth ?? true,
    },
    // The git service backs every panel; the SPA calls it directly.
    services: [{ package: GIT_SERVICE, ...(cwd ? { options: { cwd } } : {}) }],
    // Bake repo state into the static build. The service defines no dump of
    // its own, so the read ops are opted in here: status/branches/diff bake
    // their no-arg call; log bakes the 200-commit head; show bakes one
    // (patch-less) record per commit, enumerated at build time via the
    // service's node API.
    rpc: {
      snapshot: [
        'devframes:service:git:status',
        'devframes:service:git:branches',
        'devframes:service:git:diff',
        { method: 'devframes:service:git:log', inputs: [[{ limit: 200 }]] },
        {
          method: 'devframes:service:git:show',
          inputs: async (ctx) => {
            const git = ctx.services.get(GIT_SERVICE)
            if (!git)
              return []
            const { commits } = await git.log({ limit: 200 })
            return commits.map(commit => [{ hash: commit.hash, patch: false }])
          },
        },
      ],
    },
    setup() {},
  })
}

export default createGitDevframe
