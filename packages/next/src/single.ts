// `@devframes/next/single` hosts a SINGLE devframe's SPA inside a Next.js
// App Router app: the config helper that lets mounted SPAs' relative assets
// resolve, and the catch-all route handler that serves one devframe.
//
// The React client that connects the page to the devframe RPC lives at
// `@devframes/next/single/client` (a `'use client'` module).
export type { DevframeNextConfig } from './config'
export { withDevframe } from './config'

export type {
  CreateDevframeNextHandlerOptions,
  DevframeNextHandler,
} from './handler'
export { createDevframeNextHandler } from './handler'
