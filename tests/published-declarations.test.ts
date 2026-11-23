import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A declaration file that side-effect imports an optional peer makes TS2882
 * ("Cannot find module or type declarations for side-effect import of ...")
 * fire for a consumer that installed the package without that peer.
 *
 * The registrations live in the client graph (`packages/hub-ui/src/client/types.ts`
 * imports `@devframes/json-render/hub`), so the node entry's declaration rollup
 * must not import any client module.
 */
describe('published declarations never require an optional peer', () => {
  it('keeps @devframes/hub-ui\'s node entry off the client type graph', () => {
    const dts = readFileSync(
      fileURLToPath(new URL('../packages/hub-ui/dist/index.d.mts', import.meta.url)),
      'utf8',
    )
    const sideEffectImports = dts
      .split('\n')
      .filter(line => /^import\s+["']/.test(line))
      .filter(line => /@devframes\/json-render|@devframes\/hub\/client/.test(line))

    expect(sideEffectImports).toEqual([])
  })
})
