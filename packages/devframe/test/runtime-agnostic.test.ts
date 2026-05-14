import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Entries that must run in any JS runtime (browser, edge, Node).
// Keep in sync with `packages/devframe/package.json` exports — explicit list
// so additions are a conscious choice.
const AGNOSTIC_ENTRIES = [
  'client/index.mjs',
  'utils/colors.mjs',
  'utils/events.mjs',
  'utils/hash.mjs',
  'utils/human-id.mjs',
  'utils/nanoid.mjs',
  'utils/promise.mjs',
  'utils/shared-state.mjs',
  'utils/streaming-channel.mjs',
  'utils/structured-clone.mjs',
  'utils/when.mjs',
] as const

const distRoot = fileURLToPath(new URL('../dist/', import.meta.url))

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
])

const IMPORT_FROM_RE = /(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]/g
const SIDE_EFFECT_IMPORT_RE = /(?:^|[\s;{])import\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

interface Offender {
  importer: string
  specifier: string
  statement: string
}

function collectImports(src: string): string[] {
  const ids: string[] = []
  for (const re of [IMPORT_FROM_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    for (const match of src.matchAll(re))
      ids.push(match[1])
  }
  return ids
}

function statementFor(src: string, specifier: string): string {
  for (const re of [IMPORT_FROM_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    for (const match of src.matchAll(re)) {
      if (match[1] === specifier)
        return match[0].trim()
    }
  }
  return ''
}

function scanTransitiveBuiltins(entryAbs: string): Offender[] {
  const visited = new Set<string>()
  const offenders: Offender[] = []
  const queue: string[] = [entryAbs]

  while (queue.length) {
    const file = queue.shift()!
    if (visited.has(file))
      continue
    visited.add(file)

    if (!existsSync(file))
      continue
    const src = readFileSync(file, 'utf8')

    for (const id of collectImports(src)) {
      if (nodeBuiltins.has(id)) {
        offenders.push({
          importer: relative(distRoot, file),
          specifier: id,
          statement: statementFor(src, id),
        })
        continue
      }
      // Relative import — follow it.
      if (id.startsWith('./') || id.startsWith('../')) {
        const resolved = resolve(dirname(file), id)
        queue.push(resolved)
      }
      // Bare specifiers other than node builtins are treated as resolved
      // (they'd be installed-as-dep; not part of this check).
    }
  }

  return offenders
}

describe('runtime-agnostic dist entries', () => {
  for (const entry of AGNOSTIC_ENTRIES) {
    it(entry, () => {
      const filePath = resolve(distRoot, entry)
      expect(existsSync(filePath), `Missing ${entry} — run \`pnpm build\` first`).toBe(true)

      const offenders = scanTransitiveBuiltins(filePath)
      const formatted = offenders.map(o => `  ${o.importer}: ${o.statement}`)

      expect(
        formatted,
        `${entry} (transitively) must not import node builtins`,
      ).toEqual([])
    })
  }
})
