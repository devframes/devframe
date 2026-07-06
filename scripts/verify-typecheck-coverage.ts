import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Guards the convention from AGENTS.md's "Development" section: *"every
 * workspace package owns a `typecheck` script … add one to every new
 * package so it can't silently skip type errors."*
 *
 * `pnpm typecheck` runs `turbo run typecheck`, which only runs the task in
 * packages that **declare** it (`turbo.json`'s `typecheck` task fans out via
 * `dependsOn: ["^typecheck"]`, but never invents the script). A workspace
 * package with a `tsconfig.json` and no `typecheck` script is silently
 * skipped instead of failing loud — this script scans every workspace
 * package for that gap and fails CI when it finds one that isn't a
 * documented exception below.
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Workspace globs, mirrored from `pnpm-workspace.yaml`'s `packages:` list.
 */
const WORKSPACE_PATTERNS = ['packages/*', 'plugins/*', 'examples/*', 'storybook', 'docs']

/**
 * Packages with a `tsconfig.json` that intentionally don't have a
 * `typecheck` script yet. Each entry is a `pnpm typecheck` blind spot, so
 * keep this list short and remove an entry the moment its package gets a
 * working script — the check below fails if an entry is stale (the package
 * already has one).
 */
const EXCEPTIONS: Record<string, string> = {
  'plugins/inspect': 'tsconfig.json is the only one with composite:true, which makes tsc reject valid cross-package imports (TS6307); also has a couple of unrelated spa/composables type bugs. See plans/README.md "Execution notes" for plan 001.',
  'examples/minimal-next-devframe-hub': 'packages/hub/src/node/host-terminals.ts types a child-process env as NodeJS.ProcessEnv, and Next.js\'s ambient types require a literal NODE_ENV on that interface once this app pulls hub into its program. See plans/README.md "Execution notes" for plan 001.',
}

function expandPattern(pattern: string): string[] {
  if (!pattern.endsWith('/*'))
    return [pattern]
  const base = pattern.slice(0, -2)
  const baseDir = join(rootDir, base)
  if (!existsSync(baseDir))
    return []
  return readdirSync(baseDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `${base}/${entry.name}`)
}

function hasTypecheckScript(dir: string): boolean {
  const pkgPath = join(rootDir, dir, 'package.json')
  if (!existsSync(pkgPath))
    return false
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return Boolean(pkg.scripts?.typecheck)
}

const dirs = WORKSPACE_PATTERNS.flatMap(expandPattern)

const missing = dirs.filter((dir) => {
  const pkgPath = join(rootDir, dir, 'package.json')
  const tsconfigPath = join(rootDir, dir, 'tsconfig.json')
  if (!existsSync(pkgPath) || !existsSync(tsconfigPath))
    return false
  return !hasTypecheckScript(dir) && !(dir in EXCEPTIONS)
})

const staleExceptions = Object.keys(EXCEPTIONS).filter(dir => hasTypecheckScript(dir))

if (missing.length > 0) {
  console.error('The following workspace packages have a tsconfig.json but no `typecheck` script:\n')
  for (const dir of missing) console.error(`  - ${dir}`)
  console.error('\nAdd `"typecheck": "tsc --noEmit"` to each package.json\'s scripts (see AGENTS.md), or — if it genuinely can\'t typecheck yet — add a documented exception to scripts/verify-typecheck-coverage.ts.')
}

if (staleExceptions.length > 0) {
  console.error(`${missing.length > 0 ? '\n' : ''}The following exceptions in scripts/verify-typecheck-coverage.ts are stale — the package already has a \`typecheck\` script, so remove the entry:\n`)
  for (const dir of staleExceptions) console.error(`  - ${dir}`)
}

if (missing.length > 0 || staleExceptions.length > 0)
  process.exit(1)

const covered = dirs.filter(dir => existsSync(join(rootDir, dir, 'tsconfig.json'))).length
console.log(`typecheck coverage OK — ${covered - Object.keys(EXCEPTIONS).length}/${covered} eligible packages covered, ${Object.keys(EXCEPTIONS).length} documented exception(s).`)
