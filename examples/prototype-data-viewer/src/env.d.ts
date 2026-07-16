/// <reference types="vite/client" />

/** PROTOTYPE — minimal jora typings (the package ships none). */
declare module 'jora' {
  export interface JoraQueryOptions {
    tolerant?: boolean
    stat?: boolean
  }
  export interface JoraSetupOptions {
    methods?: Record<string, string | ((current: unknown, ...args: unknown[]) => unknown)>
    assertions?: Record<string, string | ((current: unknown) => boolean)>
  }
  export type JoraQueryFn = (data: unknown, context?: unknown) => unknown
  export interface Jora {
    (query: string, options?: JoraQueryOptions): JoraQueryFn
    setup: (options?: JoraSetupOptions) => (query: string, options?: JoraQueryOptions) => JoraQueryFn
    version: string
  }
  const jora: Jora
  export default jora
}
