import type { DevframeDefinition, DevframeDeploymentKind } from '../types/devframe'
import { cleanDoubleSlashes, withLeadingSlash, withTrailingSlash } from 'ufo'

/**
 * Resolve the mount base path for a devframe's SPA. Hosted adapters
 * (`vite`, `embedded`) default to `/__<id>/` so they don't collide
 * with the host app; standalone adapters (`cli`, `spa`, `build`)
 * default to `/` because they own the origin.
 *
 * The devframe author can override with `basePath` on the definition.
 */
export function resolveBasePath(def: DevframeDefinition, kind: DevframeDeploymentKind): string {
  if (def.basePath)
    return normalizeBasePath(def.basePath)
  return kind === 'standalone' ? '/' : `/__${def.id}/`
}

export function normalizeBasePath(base: string): string {
  return cleanDoubleSlashes(withTrailingSlash(withLeadingSlash(base)))
}
