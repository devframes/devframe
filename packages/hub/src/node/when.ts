import type { DevframeWhen } from '../types/docks'

/**
 * Resolve a dock entry's authored {@link DevframeWhen} down to the wire
 * contract (`string | undefined`) that clients evaluate with `whenexpr`.
 *
 * Called once per serialization (`DevframeDocksHost.values()` /
 * `projectView`) so a function `when` is re-invoked on every pass — the
 * server-side equivalent of the built-ins' `get when()` getters, but one
 * that survives being copied by value (e.g. `mountDevframe`'s
 * `...options.dock` spread).
 */
export function resolveWhen(when: DevframeWhen | undefined): string | undefined {
  const value = typeof when === 'function' ? when() : when
  if (value === false)
    return 'false'
  if (value === true || value == null)
    return undefined
  return value
}
