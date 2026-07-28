import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import assetsDevframe from './index'

export function createAssetsCli(): CacHandle {
  return createCac(assetsDevframe)
}
