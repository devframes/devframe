// Builds each plugin's Storybook into `storybook-static/<id>/` so the hub's
// build/preview mode (`vite preview`) can serve them statically on one origin.
// The hub UI itself is built separately with `vite build` (→ `dist/`); together
// they give a fully static preview. In dev the hub spawns `storybook dev` on
// demand instead, so this step is only needed for the static preview.
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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

// Each plugin → storybook-static/<id>/, built from the plugin's own `.storybook`
// config so the hub can serve `/__sb-<id>/` from a single origin in preview.
for (const id of plugins) {
  build(id, `${repoRoot}plugins/${id}`, [
    '--config-dir',
    `${repoRoot}plugins/${id}/.storybook`,
    '--output-dir',
    `${outDir}/${id}`,
  ])
}

console.warn(`\n✓ plugin Storybooks built → ${outDir}`)
