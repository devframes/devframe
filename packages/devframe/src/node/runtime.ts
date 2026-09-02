/**
 * The server-side JavaScript runtime devframe is executing under. Only the
 * three runtimes with a first-party crossws WebSocket adapter are named; every
 * other environment reports `node` and takes the `node:http` path.
 */
export type ServerRuntime = 'node' | 'bun' | 'deno'

/**
 * Detect the current server runtime from its runtime-specific global. The
 * WebSocket binding branches on this: Bun and Deno expose their sockets as
 * `fetch` upgrades through `Bun.serve` / `Deno.serve` (crossws's Bun/Deno
 * adapters), while the `node:http` upgrade event - and crossws's Node adapter,
 * which refuses to run anywhere else - is Node-only.
 */
export function detectServerRuntime(): ServerRuntime {
  const g = globalThis as { Deno?: unknown, Bun?: unknown }
  if (typeof g.Deno !== 'undefined')
    return 'deno'
  if (typeof g.Bun !== 'undefined')
    return 'bun'
  return 'node'
}
