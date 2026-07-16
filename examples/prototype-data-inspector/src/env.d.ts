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
  export interface JoraSyntax {
    parse: (source: string, tolerantMode?: boolean) => unknown
    tokenize: (source: string) => unknown
    stringify: (ast: unknown) => string
    walk: (ast: unknown, visitor: unknown) => void
  }
  export interface Jora {
    (query: string, options?: JoraQueryOptions): JoraQueryFn
    setup: (options?: JoraSetupOptions) => (query: string, options?: JoraQueryOptions) => JoraQueryFn
    syntax: JoraSyntax
    version: string
  }
  const jora: Jora
  export default jora
}
