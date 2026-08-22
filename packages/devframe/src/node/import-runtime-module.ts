import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * Resolve and import a package at runtime without adding it to a consumer's
 * bundle graph. First-party adapters use this for optional peers whose code
 * is needed only when the matching feature is enabled.
 *
 * @internal
 */
export async function importRuntimeModule<T = unknown>(specifier: string): Promise<T> {
  const resolved = createRequire(import.meta.url).resolve(specifier)
  return await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ pathToFileURL(resolved).href) as T
}
