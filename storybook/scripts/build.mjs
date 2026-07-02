// Builds the unified Storybook: the host shell into `storybook-static/`, then
// each plugin's Storybook into a subfolder so the host's production refs
// (`./git`, `./inspect`, …) resolve on a single origin. Serve `storybook-static/`
// (e.g. `npx sirv-cli storybook-static`) to view the composed result.
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const outDir = fileURLToPath(new URL('../storybook-static', import.meta.url))

const plugins = ['git', 'inspect', 'code-server', 'terminals', 'a11y']

function build(label, cwd, args) {
  console.warn(`\n▶ building ${label} Storybook…`)
  const result = spawnSync('storybook', ['build', ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    console.error(`✗ failed to build ${label} Storybook`)
    process.exit(result.status ?? 1)
  }
}

// 1) Host shell → storybook-static/ (this also cleans the output directory).
build('host', pkgRoot, ['--output-dir', outDir])

// 2) Each plugin → storybook-static/<id>/ (created after the host build, so they
//    survive the host's clean).
for (const id of plugins) {
  build(id, `${repoRoot}plugins/${id}`, [
    '--config-dir',
    `${repoRoot}plugins/${id}/.storybook`,
    '--output-dir',
    `${outDir}/${id}`,
  ])
}

console.warn(`\n✓ unified Storybook built → ${outDir}`)
