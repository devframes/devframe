import process from 'node:process'
import { defineRpcFunction } from 'devframe'

export interface SystemInfo {
  node: string
  platform: NodeJS.Platform
  arch: string
  pid: number
  cwd: string
  startedAt: number
}

const startedAt = Date.now()

export const system = defineRpcFunction({
  name: 'next-runtime-snapshot:system',
  type: 'static',
  jsonSerializable: true,
  handler: (): SystemInfo => ({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    cwd: process.cwd(),
    startedAt,
  }),
})
