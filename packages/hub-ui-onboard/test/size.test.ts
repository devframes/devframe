import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))

/** The whole point of this package is its install size; these budgets keep it honest. */
const CLIENT_BUDGET = 40 * 1024
const DIST_BUDGET = 150 * 1024

function totalSize(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const path = join(dir, entry.name)
    return sum + (entry.isDirectory() ? totalSize(path) : statSync(path).size)
  }, 0)
}

it('keeps the floating button under budget', () => {
  expect(statSync(join(DIST, 'client/embedded.js')).size).toBeLessThan(CLIENT_BUDGET)
})

it('keeps the published files under budget', () => {
  expect(totalSize(DIST)).toBeLessThan(DIST_BUDGET)
})
