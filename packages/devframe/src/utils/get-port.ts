// Re-exported so plugins and other `devframe/*` consumers can resolve a
// free port without taking their own dependency on `get-port-please` — it
// travels as a `devframe` devDependency instead, bundled into this
// package's node build (see `tsdown.config.ts`'s `deps.onlyBundle`).
export { getPort } from 'get-port-please'
export type { GetPortInput, GetPortOptions } from 'get-port-please'
