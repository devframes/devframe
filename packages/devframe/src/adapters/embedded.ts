import type { DevframeNodeContext } from '../types/context'
import type { DevframeDefinition } from '../types/devframe'

export interface CreateEmbeddedOptions {
  /** Target context the devframe is registered into. Required. */
  ctx: DevframeNodeContext
}

/**
 * Register a devframe into an already-running devframe/Kit context at
 * runtime. Mirrors what the Vite plugin scan does for devframes passed
 * as plugin options, but exposes the same flow to callers that need
 * dynamic, post-startup registration.
 *
 * The host owns the mount path; when a hosted mount is needed the
 * effective default follows the hosted rule of `def.basePath ?? '/__<id>/'`.
 */
export async function createEmbedded(d: DevframeDefinition, options: CreateEmbeddedOptions): Promise<void> {
  // Services ready before setup. `ready()` is idempotent: on an
  // already-running host it's a no-op and the fresh installs construct
  // immediately; on a not-yet-started one it fires the initial barrier.
  for (const input of d.services ?? [])
    void options.ctx.services.install(input, { resolveFrom: d.packageName })
  await options.ctx.services.ready()
  await d.setup(options.ctx)
}
