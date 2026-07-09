import fs from 'node:fs'
import process from 'node:process'
import { destr } from 'destr'
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

export function createStorage<T extends object>(options: CreateStorageOptions<T>) {
  const {
    mergeInitialValue = (initialValue, savedValue) => ({ ...initialValue, ...savedValue }),
    debounce: debounceTime = 100,
  } = options

  let initialValue: T = options.initialValue
  if (fs.existsSync(options.filepath)) {
    try {
      const savedValue = destr<T>(fs.readFileSync(options.filepath, 'utf-8'), { strict: true })
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
