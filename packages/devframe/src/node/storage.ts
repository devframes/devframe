import fs from 'node:fs'
import process from 'node:process'
import { createSharedState } from 'devframe/utils/shared-state'
import { dirname } from 'pathe'
import { debounce } from 'perfect-debounce'
import { diagnostics } from './diagnostics'

export interface CreateStorageOptions<T extends object> {
  filepath: string
  initialValue: T
  mergeInitialValue?: false | ((initialValue: T, savedValue: T) => T)
  debounce?: number
}

// `JSON.parse` with a reviver that drops `__proto__`/`constructor.prototype`
// keys, guarding against prototype pollution. Storage only reads back JSON it
// wrote via `JSON.stringify`, so invalid JSON should throw (caught below)
// rather than fall back to a raw string.
function safeJsonParse<T>(text: string): T {
  return JSON.parse(text, (key, value) => {
    if (key === '__proto__' || (key === 'constructor' && value && typeof value === 'object' && 'prototype' in value))
      return undefined
    return value
  })
}

export function createStorage<T extends object>(options: CreateStorageOptions<T>) {
  const {
    mergeInitialValue = (initialValue, savedValue) => ({ ...initialValue, ...savedValue }),
    debounce: debounceTime = 100,
  } = options

  let initialValue: T = options.initialValue
  if (fs.existsSync(options.filepath)) {
    try {
      const savedValue = safeJsonParse<T>(fs.readFileSync(options.filepath, 'utf-8'))
      initialValue = mergeInitialValue ? mergeInitialValue(options.initialValue, savedValue) : savedValue
    }
    catch (error) {
      diagnostics.DF0012({ filepath: options.filepath, cause: error }, { method: 'warn' })
      initialValue = options.initialValue
    }
  }

  const state = createSharedState<T>({
    initialValue,
    enablePatches: false,
  })

  // throttle the write to the file
  state.on(
    'updated',
    debounce((newState) => {
      try {
        const dir = dirname(options.filepath)
        fs.mkdirSync(dir, { recursive: true })
        const tmp = `${options.filepath}.${process.pid}.tmp`
        fs.writeFileSync(tmp, `${JSON.stringify(newState, null, 2)}\n`)
        fs.renameSync(tmp, options.filepath) // atomic replace on same filesystem
      }
      catch (error) {
        diagnostics.DF0035({ filepath: options.filepath, cause: error }, { method: 'error' })
      }
    }, debounceTime),
  )

  return state
}
