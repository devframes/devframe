import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// The Next.js static export is this example's iframe SPA; it is served from
// `dist/client` by the standalone CLI, the playground host, and the tests.

// A manual walk with explicit modes: Next's export emits entries with
// restrictive modes that node's `cpSync` inherits and then trips over, so
// recreate the tree with normal directory/file permissions instead.
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true, mode: 0o755 })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory())
      copyTree(from, to)
    else if (entry.isFile())
      copyFileSync(from, to)
  }
}

rmSync('dist/client', { recursive: true, force: true })
copyTree('app/out', 'dist/client')
