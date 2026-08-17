import { cpSync, rmSync } from 'node:fs'

// The Next.js static export is the plugin's iframe SPA; it ships in the
// lockstep `@devframes/plugin-git--assets` package, not the node package.
rmSync('assets-pkg/dist', { recursive: true, force: true })
cpSync('src/client/out', 'assets-pkg/dist', { recursive: true })
