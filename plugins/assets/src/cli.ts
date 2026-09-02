import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import { createAssetsDevframe } from './index'

export function createAssetsCli(): CacHandle {
  // The standalone CLI is its own host, so it serves the managed directory
  // itself (under a dedicated base), unlike the mounted plugin, which
  // defers to the Vite/framework dev server it's attached to.
  return createCac(createAssetsDevframe({ serveStatic: true }))
}
