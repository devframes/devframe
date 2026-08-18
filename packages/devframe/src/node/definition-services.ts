import type { DevframeNodeContext } from '../types/context'
import type { DevframeDefinition } from '../types/devframe'
import { createRequire } from 'node:module'
import { join } from 'pathe'

/**
 * Resolve the base path service imports should resolve **from** for a
 * definition: the declaring plugin's own package (so a plugin-declared
 * service resolves against the plugin's dependencies). Falls back to
 * `undefined` when the plugin package isn't resolvable (e.g. an inline,
 * unpublished definition) — the services host then resolves from the
 * workspace root.
 */
function resolveDefinitionResolveFrom(def: DevframeDefinition, cwd: string): string | undefined {
  if (!def.packageName)
    return undefined
  const require = createRequire(join(cwd, '_devframe_resolve.js'))
  try {
    return require.resolve(`${def.packageName}/package.json`)
  }
  catch {}
  try {
    return require.resolve(def.packageName)
  }
  catch {}
  return undefined
}

/**
 * Queue a definition's declarative `services` on the context — called by
 * every adapter (and a hub's install path) **before** `def.setup(ctx)` runs,
 * so declarative option sets precede setup-time installs in the merge order.
 * Installation itself happens at the `ctx.services.ready()` barrier the
 * adapter fires once every devframe's setup has run.
 */
export async function installDefinitionServices(context: DevframeNodeContext, def: DevframeDefinition): Promise<void> {
  if (!def.services || def.services.length === 0)
    return
  const resolveFrom = resolveDefinitionResolveFrom(def, context.cwd)
  await Promise.all(def.services.map(input => context.services.install(input, resolveFrom ? { resolveFrom } : {})))
}
