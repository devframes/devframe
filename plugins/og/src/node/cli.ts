import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import createOgDevframe from './index'

export function createOgCli(): CacHandle {
  return createCac(createOgDevframe())
}
