import type { DevframeDefinition } from 'devframe/types'
import { createRequire } from 'node:module'
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

/**
 * A turnkey json-render **view provider** — a {@link DevframeDefinition} serving
 * this package's prebuilt SPA, ready to register with a hub's view-provider
 * slot so `json-render` docks render in an iframe:
 *
 * ```ts
 * import { jsonRenderProvider } from '@devframes/json-render-ui/spa'
 * initHub({ viewProviders: { 'json-render': jsonRenderProvider() } })
 * ```
 *
 * The provider frame only serves the SPA; view specs are published by other
 * devframes' `setup()` (via `createJsonRenderView`) into shared state the SPA
 * reads by `stateKey`, so its own `setup` is a no-op. Any field can be
 * overridden (id, name, port, a custom `distDir` for a community renderer, …).
 */
export function jsonRenderProvider(overrides: Partial<DevframeDefinition> = {}): DevframeDefinition {
  const { version } = createRequire(import.meta.url)('../package.json') as { version: string }
  return {
    id: 'json-render',
    name: 'JSON Render',
    version,
    packageName: '@devframes/json-render-ui',
    homepage: 'https://github.com/devframes/devframe#readme',
    description: 'Reference json-render view provider.',
    icon: 'ph:layout-duotone',
    setup: () => {},
    ...overrides,
    spa: { loader: 'none', ...overrides.spa },
    cli: { ...overrides.cli, distDir: overrides.cli?.distDir ?? jsonRenderSpaDir },
  }
}
