import type { DevframeNodeContext } from 'devframe/types'
import fs from 'node:fs'
import { join } from 'pathe'
import { diagnostics } from './diagnostics'
import { settingsDirectory } from './settings'

/**
 * Marker recording that the user dismissed the shared-scope settings notice.
 * It sits next to the global settings files, so one machine dismisses once.
 * It does not end in `.json`, so it is never mistaken for a namespace file.
 */
const NOTICE_MARKER = '.shared-scope-notice'

export interface LegacySharedSettingsNotice {
  /** Namespaces whose global settings file predates the scope split. */
  namespaces: string[]
}

/**
 * Detect settings written before `project` and `global` got separate files.
 *
 * Earlier versions persisted both scopes into `global`'s
 * `settings/<namespace>.json` with per-key last-write-wins, so a surviving
 * value's scope is unknowable. Any namespace file in the global directory is
 * evidence of that history. There is nothing to migrate and nothing to split:
 * the notice only tells the user that the two scopes now diverge from here on.
 *
 * Empty once the user dismissed it, once the directory holds no namespace
 * file, or when the global settings directory is unreadable.
 */
export function readLegacySharedSettingsNotice(context: DevframeNodeContext): LegacySharedSettingsNotice {
  const dir = settingsDirectory(context, 'global')
  if (fs.existsSync(join(dir, NOTICE_MARKER)))
    return { namespaces: [] }
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  }
  catch {
    // No settings directory yet: the machine never wrote a settings file.
    return { namespaces: [] }
  }
  return {
    namespaces: entries
      .filter(name => name.endsWith('.json') && !name.startsWith('.'))
      .map(name => name.slice(0, -'.json'.length))
      .sort(),
  }
}

/** Write the dismissal marker, so the notice never shows again on this machine. */
export function dismissLegacySharedSettingsNotice(context: DevframeNodeContext): void {
  const dir = settingsDirectory(context, 'global')
  const filepath = join(dir, NOTICE_MARKER)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filepath, `${new Date().toISOString()}\n`)
  }
  catch (error) {
    diagnostics.DF0087({ filepath, cause: error })
  }
}
