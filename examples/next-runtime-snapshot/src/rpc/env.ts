import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'

const SECRET_KEY_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|PASS|AUTH|CREDENTIAL/i

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

const EnvEntrySchema = v.object({
  key: v.string(),
  value: v.string(),
  redacted: v.boolean(),
})

export const env = defineRpcFunction({
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
})
