import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ecosystemDir = resolve(rootDir, '.ecosystem')
const devtoolsDir = resolve(ecosystemDir, 'devtools')

const REPO_URL = 'https://github.com/vitejs/devtools.git'
const RELEASES_API = 'https://api.github.com/repos/vitejs/devtools/releases/latest'
const KEEP = process.env.ECOSYSTEM_KEEP === '1'

interface PackageManifest {
  name: string
  version: string
  pnpm?: {
    overrides?: Record<string, string>
    [key: string]: unknown
  }
  [key: string]: unknown
}

async function main(): Promise<void> {
  const ref = await resolveRef()
  log(`Target: vitejs/devtools @ ${ref}`)

  const tarball = packDevframe()
  log(`Packed devframe: ${tarball}`)

  prepareClone(ref)
  patchPackageJson(devtoolsDir, tarball)

  run('pnpm', ['install', '--no-frozen-lockfile'], devtoolsDir)
  run('pnpm', ['build'], devtoolsDir)
  run('pnpm', ['test'], devtoolsDir)

  log('All downstream checks passed')
}

async function resolveRef(): Promise<string> {
  const override = process.env.ECOSYSTEM_DEVTOOLS_REF
  if (override)
    return override

  const headers: Record<string, string> = { 'user-agent': 'devframe-ecosystem-ci' }
  if (process.env.GITHUB_TOKEN)
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const res = await fetch(RELEASES_API, { headers })
  if (!res.ok)
    throw new Error(`Failed to query latest release: ${res.status} ${res.statusText}`)
  const data = await res.json() as { tag_name?: string }
  if (!data.tag_name)
    throw new Error('GitHub release payload missing tag_name')
  return data.tag_name
}

function packDevframe(): string {
  const devframePkg = resolve(rootDir, 'packages', 'devframe')
  const pkg = readManifest(resolve(devframePkg, 'package.json'))
  const expected = `${pkg.name}-${pkg.version}.tgz`

  mkdirSync(ecosystemDir, { recursive: true })
  for (const f of readdirSync(ecosystemDir)) {
    if (/^devframe-\d.*\.tgz$/.test(f))
      rmSync(resolve(ecosystemDir, f))
  }

  run('pnpm', ['pack', '--pack-destination', ecosystemDir], devframePkg)

  const tarball = resolve(ecosystemDir, expected)
  if (!existsSync(tarball))
    throw new Error(`Expected packed tarball not found: ${tarball}`)
  return tarball
}

function prepareClone(ref: string): void {
  mkdirSync(ecosystemDir, { recursive: true })

  if (KEEP && existsSync(devtoolsDir)) {
    log(`Reusing existing clone at ${devtoolsDir} (ECOSYSTEM_KEEP=1)`)
    return
  }

  if (existsSync(devtoolsDir))
    rmSync(devtoolsDir, { recursive: true, force: true })

  // Use init + fetch instead of `clone --branch` so any ref works — tag,
  // branch, or commit SHA. GitHub allows fetching reachable SHAs by default.
  mkdirSync(devtoolsDir, { recursive: true })
  run('git', ['init', '--quiet'], devtoolsDir)
  run('git', ['remote', 'add', 'origin', REPO_URL], devtoolsDir)
  run('git', ['fetch', '--depth', '1', 'origin', ref], devtoolsDir)
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], devtoolsDir)
}

function patchPackageJson(repoDir: string, tarball: string): void {
  const pkgPath = resolve(repoDir, 'package.json')
  const pkg = readManifest(pkgPath)
  pkg.pnpm ??= {}
  pkg.pnpm.overrides = { ...(pkg.pnpm.overrides ?? {}), devframe: `file:${tarball}` }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  log(`Patched ${pkgPath}: devframe -> file:${tarball}`)
}

function readManifest(file: string): PackageManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as PackageManifest
}

function run(cmd: string, args: string[], cwd: string = rootDir): void {
  log(`$ ${cmd} ${args.join(' ')}  (in ${cwd})`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false })
  if (result.error)
    throw new Error(`Command failed to spawn: ${cmd} ${args.join(' ')}: ${result.error.message}`)
  if (result.signal)
    throw new Error(`Command terminated by signal ${result.signal}: ${cmd} ${args.join(' ')}`)
  if (result.status !== 0)
    throw new Error(`Command failed (exit ${result.status ?? 'unknown'}): ${cmd} ${args.join(' ')}`)
}

function log(msg: string): void {
  console.log(`[ecosystem-ci] ${msg}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
