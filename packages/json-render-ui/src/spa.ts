import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'

/**
 * Absolute path to the prebuilt standalone SPA assets shipped by this package
 * (`dist/spa`). Point a devframe's `cli.distDir` at it to serve the out-of-box
 * renderer with no client build:
 *
 * ```ts
 * import { jsonRenderSpaDir } from '@devframes/json-render-ui/spa'
 * defineDevframe({ cli: { command: 'my-app', distDir: jsonRenderSpaDir }, spa: { loader: 'none' } })
 * ```
 *
 * This entry is node-safe: it imports no Vue and no `@antfu/design`, so a build
 * tool can read the path without pulling the browser renderer graph.
 */
export const jsonRenderSpaDir: string = fileURLToPath(new URL('./spa/', import.meta.url))

/**
 * Wrap a devframe definition so it serves the prebuilt {@link jsonRenderSpaDir
 * standalone SPA}. Presets `spa.loader: 'none'` and defaults `cli.distDir` to
 * the SPA assets (an explicit `cli.distDir` still wins). The author supplies
 * everything else (id, name, `setup`, port, …) as usual.
 *
 * ```ts
 * export default createJsonRenderDevframe({
 *   id: 'my-app', name: 'My App', version, packageName, homepage, description,
 *   cli: { command: 'my-app', port: 9800, auth: false },
 *   setup(ctx) { createJsonRenderView(ctx, { id: 'main', spec }) },
 * })
 * ```
 */
export function createJsonRenderDevframe(definition: DevframeDefinition): DevframeDefinition {
  return {
    ...definition,
    spa: { loader: 'none', ...definition.spa },
    cli: { ...definition.cli, distDir: definition.cli?.distDir ?? jsonRenderSpaDir },
  }
}
