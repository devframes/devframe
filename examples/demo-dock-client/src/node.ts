import { fileURLToPath } from 'node:url'

/**
 * Absolute path of the prebuilt, self-contained client script
 * (`dist/bundle.mjs`, nanoevents inlined). A host without bare-specifier
 * resolution mounts this file's directory statically and passes the served
 * URL as the dock's `importFrom` — the same pattern as
 * `@devframes/plugin-a11y`'s `a11yPageScriptBundlePath`.
 */
export const demoDockClientBundlePath: string = fileURLToPath(new URL('./bundle.mjs', import.meta.url))
