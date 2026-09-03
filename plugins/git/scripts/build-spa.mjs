import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// The Next.js static export is the plugin's iframe SPA; it ships in the
// lockstep `@devframes/plugin-git--assets` package, not the node package.

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

rmSync('assets-pkg/dist', { recursive: true, force: true })
copyTree('app/out', 'assets-pkg/dist')
