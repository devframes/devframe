import { cp, rm } from 'node:fs/promises'

// The Next.js static export is the plugin's iframe SPA; it ships in the
// lockstep `@devframes/plugin-git--assets` package, not the node package.
// `fs.promises.cp` rather than `cpSync`: the sync variant's native directory
// copy fails (EACCES) on shared-mount filesystems (e.g. virtiofs, Docker
// Desktop mounts).
await rm('assets-pkg/dist', { recursive: true, force: true })
await cp('src/client/out', 'assets-pkg/dist', { recursive: true })
