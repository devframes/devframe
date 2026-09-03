import { chmodSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join } from 'node:path'

rmSync('dist/client', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
// `fs.promises.cp` rather than `cpSync`: the sync variant's native directory
// copy fails (EACCES) on shared-mount filesystems (e.g. virtiofs, Docker
// Desktop mounts).
await cp('src/client/out', 'dist/client', { recursive: true })

// A built SPA must be readable to be served. Some filesystems (e.g. Docker
// Desktop's shared mounts) drop the read bits when copying, which yields
// unservable assets and trips downstream `createBuild` copies. Normalize the
// tree so directories are traversable and files are world-readable.
function normalizePermissions(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      chmodSync(path, 0o755)
      normalizePermissions(path)
    }
    else if (entry.isFile()) {
      chmodSync(path, 0o644)
    }
  }
}

normalizePermissions('dist/client')
