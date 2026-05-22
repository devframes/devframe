import process from 'node:process'
import { defineRpcFunction } from 'devframe'

export interface MemorySnapshot {
  memory: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    arrayBuffers: number
  }
  uptimeSeconds: number
  capturedAt: number
}

export const memory = defineRpcFunction({
  name: 'next-runtime-snapshot:memory',
  type: 'query',
  jsonSerializable: true,
  handler: (): MemorySnapshot => {
    const m = process.memoryUsage()
    return {
      memory: {
        rss: m.rss,
        heapTotal: m.heapTotal,
        heapUsed: m.heapUsed,
        external: m.external,
        arrayBuffers: m.arrayBuffers,
      },
      uptimeSeconds: process.uptime(),
      capturedAt: Date.now(),
    }
  },
})
