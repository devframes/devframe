/**
 * Public surface for first-party hub adapters (`@devframes/hub` and
 * similar). Carries the primitives a hub-kit author needs to bridge a
 * framework dev server into a hub context — base-path resolution and
 * the remote-dock token bridge used by the hub's docks host.
 *
 * Stable across minor versions; treat additions or removals as breaking
 * only across major versions.
 */

export {
  normalizeBasePath,
  resolveBasePath,
} from '../../adapters/_shared'

export {
  getInternalContext,
  internalContextMap,
} from './context'

export type {
  DevframeInternalContext,
  InternalAnonymousAuthStorage,
  RemoteTokenRecord,
} from './context'
