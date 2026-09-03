import type { DockRendererRegistration } from '@devframes/hub/initiate'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The prebuilt renderer module lives next to the built entry (`dist/hub.mjs`
 * → `dist/renderer/json-render.mjs`). When this module runs from source
 * instead (tests and playgrounds resolving the workspace alias), fall back to
 * the package's `dist/renderer/`, since the module is a build artifact either way.
 */
function rendererFile(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const sibling = join(here, 'renderer/json-render.mjs')
  if (existsSync(sibling))
    return sibling
  return join(here, '../dist/renderer/json-render.mjs')
}

/**
 * Register the reference json-render frontend on a hub: the one-liner that
 * composes `@devframes/json-render-ui` into any prebuilt viewer:
 *
 * ```ts
 * import { initHub } from '@devframes/hub/initiate'
 * import { createUi } from '@devframes/hub-ui'
 * import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
 *
 * initHub({ ui: createUi(), renderers: [jsonRenderUiRenderer()] })
 * ```
 *
 * The hub serves the package's prebuilt, self-contained renderer module at
 * `<base>__renderers/json-render.mjs` and publishes it in the renderer
 * manifest; viewers import it lazily the first time a `'json-render'` dock
 * mounts. Without any registration for that type, a viewer shows its
 * missing-renderer fallback instead; swap this helper for any community
 * implementation of the `JsonRenderDockRenderer` contract.
 *
 * This entry is node-safe: it imports no Vue and no `@antfu/design`, so a
 * host can read the registration without pulling the browser renderer graph.
 */
export function jsonRenderUiRenderer(): DockRendererRegistration {
  return { type: 'json-render', file: rendererFile() }
}
