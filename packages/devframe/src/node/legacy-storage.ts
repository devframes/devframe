import type { DevframeHost, DevframeStorageScope } from '../types/host'

/**
 * Optional host capability: where earlier versions of the host kept a storage
 * scope.
 *
 * A host that moved a scope's directory exposes it, so a devframe can read
 * state written before the move once (an import, a settings fallback). It is
 * NOT part of {@link DevframeHost}: a host that never moved its storage omits
 * it, and callers MUST treat the absence as "no legacy data here".
 */
export interface DevframeHostLegacyStorage {
  getLegacyStorageDir?: (scope: DevframeStorageScope) => string
}

/**
 * Read the legacy directory a host may still expose for `scope`, duck-typed so
 * the capability stays optional. Returns `undefined` when the host does not
 * implement it, returns a non-string, or throws.
 *
 * Use it for a read-only one-time migration only. New state goes to
 * `host.getStorageDir(scope)`.
 */
export function resolveLegacyStorageDir(host: DevframeHost, scope: DevframeStorageScope): string | undefined {
  const getLegacyStorageDir = (host as DevframeHost & DevframeHostLegacyStorage).getLegacyStorageDir
  if (typeof getLegacyStorageDir !== 'function')
    return undefined
  try {
    const dir = getLegacyStorageDir.call(host, scope)
    return typeof dir === 'string' && dir.length > 0
      ? dir
      : undefined
  }
  catch {
    // A host that throws for an unsupported scope simply has no legacy data.
    return undefined
  }
}
