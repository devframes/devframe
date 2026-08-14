import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

/**
 * Two tiny static devframes — proving the playground's hub instance mounts
 * real devframes (`ctx.install` under the hood, via `initHub({ devframes })`),
 * not just the client-only dock entries `seed.ts` registers directly. Each is
 * a single static `index.html` (`devframes/<dir>/`), no build step.
 *
 * `hub-plugin.ts` mounts both with `dock: { groupId: PLAYGROUND_GROUP_ID }`,
 * collapsing them under the "Playground Tools" group `seed.ts` registers.
 */
function createPlaygroundDevframe(id: string, name: string, dir: string) {
  return defineDevframe({
    id,
    name,
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: `A tiny static devframe ("${name}") mounted by the hub-ui playground.`,
    icon: 'ph:flask-duotone',
    basePath: `/__${id}/`,
    cli: {
      distDir: fileURLToPath(new URL(`./devframes/${dir}/`, import.meta.url)),
    },
    async setup(rawCtx) {
      const ctx = rawCtx as unknown as DevframeHubContext
      await ctx.messages.add({
        level: 'info',
        message: `${name} devframe mounted`,
        description: 'Registered via the hub `devframes` list, like a real integration would be.',
      })
    },
  })
}

export const playgroundAlphaDevframe = createPlaygroundDevframe('playground-alpha', 'Alpha', 'alpha')
export const playgroundBetaDevframe = createPlaygroundDevframe('playground-beta', 'Beta', 'beta')
