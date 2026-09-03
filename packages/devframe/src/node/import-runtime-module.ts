import { importServicePackage } from './services-install'

/**
 * Resolve and import a package at runtime without adding it to a consumer's
 * bundle graph. First-party adapters use this for modules whose code is
 * needed only when the matching feature is enabled (optional peers, and the
 * MCP adapter with the SDK behind it).
 *
 * @internal
 */
export async function importRuntimeModule<T = unknown>(specifier: string): Promise<T> {
  return await importServicePackage(specifier, [import.meta.url]) as T
}
