import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineRpcFunction } from 'devframe'
import { defineDevframe } from 'devframe/types'
import * as v from 'valibot'

const BASE_PATH = '/__next-runtime-snapshot/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

const SECRET_KEY_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|PASS|AUTH|CREDENTIAL/i

export interface SystemInfo {
  node: string
  platform: NodeJS.Platform
  arch: string
  pid: number
  cwd: string
  startedAt: number
}

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

export interface EnvEntry {
  key: string
  value: string
  redacted: boolean
}

export interface EnvSnapshot {
  entries: EnvEntry[]
  total: number
  pattern: string
}

function redact(key: string, value: string): EnvEntry {
  if (SECRET_KEY_PATTERN.test(key))
    return { key, value: '••••••••', redacted: true }
  return { key, value, redacted: false }
}

const startedAt = Date.now()

export default defineDevframe({
  id: 'next-runtime-snapshot',
  name: 'Next Runtime Snapshot',
  icon: 'ph:gauge-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'next-runtime-snapshot',
    port: 9899,
    distDir,
    auth: false,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
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
    }))

    ctx.rpc.register(defineRpcFunction({
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
    }))

    const EnvEntrySchema = v.object({
      key: v.string(),
      value: v.string(),
      redacted: v.boolean(),
    })

    ctx.rpc.register(defineRpcFunction({
      name: 'next-runtime-snapshot:env',
      type: 'query',
      jsonSerializable: true,
      args: [v.object({
        pattern: v.optional(v.string(), ''),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 50),
      })],
      returns: v.object({
        entries: v.array(EnvEntrySchema),
        total: v.number(),
        pattern: v.string(),
      }),
      handler: ({ pattern, limit }): EnvSnapshot => {
        const keys = Object.keys(process.env).sort()
        let matched: string[]
        if (!pattern) {
          matched = keys
        }
        else {
          try {
            const regex = new RegExp(pattern, 'i')
            matched = keys.filter(k => regex.test(k))
          }
          // Invalid regex: match nothing rather than silently widening to all
          // keys (which could leak vars the redaction heuristic doesn't catch).
          catch {
            matched = []
          }
        }
        const entries = matched.slice(0, limit).map(k => redact(k, process.env[k] ?? ''))
        return {
          entries,
          total: matched.length,
          pattern,
        }
      },
    }))
  },
})
