import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { glob } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const distRoot = fileURLToPath(new URL('../dist/', import.meta.url))

const AUGMENTABLE_INTERFACES = [
  'DevToolsRpcClientFunctions',
  'DevToolsRpcServerFunctions',
  'DevToolsRpcSharedStates',
] as const

describe('rpc-augments dedupe', () => {
  it('declares each augmentable interface exactly once across dist/**/*.d.mts', async () => {
    const files = await glob('**/*.d.mts', { cwd: distRoot, absolute: true })
    const contents = await Promise.all(files.map(f => readFile(f, 'utf8')))
    for (const name of AUGMENTABLE_INTERFACES) {
      const re = new RegExp(`\\binterface ${name}\\b`, 'g')
      const total = contents.reduce((n, c) => n + (c.match(re)?.length ?? 0), 0)
      expect(total, name).toBe(1)
    }
  })
})
