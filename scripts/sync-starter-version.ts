import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const starterPkgPath = path.resolve(rootDir, 'starter/package.json')

/**
 * Rewrites `starter/package.json`'s `devframe`/`@devframes/*` dependency
 * ranges to `^<version>` - the starter is a self-contained, copy-paste-ready
 * template that pins real versions rather than `catalog:`/`workspace:*`, so
 * a repo-wide bump has to touch it explicitly. Called from `bump.config.ts`'s
 * `execute` hook so `bumpp -r` keeps it in lockstep automatically.
 */
export async function syncStarterVersion(version: string): Promise<void> {
  const raw = await readFile(starterPkgPath, 'utf-8')
  const pkg = JSON.parse(raw)

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (name === 'devframe' || name.startsWith('@devframes/'))
      pkg.dependencies[name] = `^${version}`
  }

  await writeFile(starterPkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

// Allow standalone invocation: `tsx scripts/sync-starter-version.ts <version>`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: tsx scripts/sync-starter-version.ts <version>')
    process.exit(1)
  }
  await syncStarterVersion(version)
}
