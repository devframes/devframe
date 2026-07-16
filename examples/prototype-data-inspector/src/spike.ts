/* eslint-disable no-console, antfu/no-top-level-await -- throwaway spike script; console output IS the deliverable */
/**
 * PROTOTYPE — throwaway code. STAGE 1 spike (node-only).
 *
 * Question: can server-side jora usefully query a LIVE ViteDevServer, with
 * custom methods bridging Map/Set, and can the normalizer make the results
 * wire-safe? Run: `pnpm --filter prototype-data-viewer spike`
 */
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createDemoGraph } from './demo-data'
import { normalize } from './normalize'
import { runQuery, suggest } from './query-engine'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Check {
  name: string
  pass: boolean
  detail: string
}
const checks: Check[] = []

function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}\n`)
}

function short(v: unknown, n = 220): string {
  const s = JSON.stringify(v)
  return s && s.length > n ? `${s.slice(0, n)}…` : String(s)
}

// ─── live Vite server ────────────────────────────────────────────────────
console.log('creating a real ViteDevServer (middlewareMode)…\n')
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
})
// Populate the module graph with a couple of real transforms.
await server.transformRequest('/src/demo-data.ts')
await server.transformRequest('/src/normalize.ts')

// 1. Top-level shape of the live server
{
  const out = runQuery(server, 'ownKeys()')
  check(
    'jora runs on live ViteDevServer (ownKeys)',
    out.ok && Array.isArray(out.result) && (out.result as unknown[]).includes('config'),
    out.ok ? `keys: ${short(out.result, 160)} in ${out.stats.queryMs}ms` : out.error.message,
  )
}

// 2. Plugin names via implicit array mapping
{
  const out = runQuery(server, 'config.plugins.name')
  check(
    'config.plugins.name (implicit map over array)',
    out.ok && Array.isArray(out.result) && (out.result as unknown[]).length > 0,
    out.ok ? `${(out.result as unknown[]).length} plugins in ${out.stats.queryMs}ms: ${short(out.result, 140)}` : out.error.message,
  )
}

// 3. Module graph Map via custom method (vite 8 mixed graph)
{
  const out = runQuery(server, 'moduleGraph.idToModuleMap.mapEntries().key')
  const ids = out.ok ? (out.result as unknown[]) : []
  check(
    'moduleGraph Map via mapEntries() custom method',
    out.ok && ids.length >= 2,
    out.ok ? `${ids.length} modules in ${out.stats.queryMs}ms: ${short(ids, 160)}` : (out as { error: { message: string } }).error.message,
  )
}

// 4. Environments API (vite 8) — nested live class instances
{
  const out = runQuery(server, 'environments.keys()')
  check(
    'vite 8 environments reachable',
    out.ok && Array.isArray(out.result) && (out.result as unknown[]).includes('client'),
    out.ok ? short(out.result, 160) : out.error.message,
  )
}

// 5. A query returning live ModuleNode class instances -> normalized
{
  const out = runQuery(server, 'moduleGraph.idToModuleMap.mapEntries().value[0:2]', { maxDepth: 4 })
  const wireable = out.ok ? isJsonSafe(out.result) : false
  check(
    'ModuleNode instances normalize to wire-safe JSON',
    out.ok && wireable,
    out.ok
      ? `query ${out.stats.queryMs}ms, normalize ${out.stats.normalize.ms}ms (${out.stats.normalize.nodes} nodes, ${out.stats.normalize.refs} $refs): ${short(out.result, 200)}`
      : out.error.message,
  )
}

// 6. Whole resolved config normalized (the stress test: plugins = functions everywhere)
{
  const out = runQuery(server, 'config', { maxDepth: 6 })
  const wireable = out.ok ? isJsonSafe(out.result) : false
  check(
    'entire ResolvedConfig normalizes + JSON-serializes',
    out.ok && wireable,
    out.ok
      ? `query ${out.stats.queryMs}ms, normalize ${out.stats.normalize.ms}ms, ${out.stats.normalize.nodes} nodes, JSON ${byteLen(out.result)} bytes`
      : out.error.message,
  )
}

// 7. Suggestions (stat mode) against the live server
{
  const q = 'config.'
  const out = suggest(server, q, q.length)
  const values = out.suggestions.map(s => s.value)
  check(
    'stat-mode suggestions on live server (autocomplete over RPC)',
    out.ok && values.includes('plugins'),
    out.ok ? `${out.suggestions.length} completions in ${out.statMs}ms: ${short(values.slice(0, 8), 200)}` : String(out.error),
  )
}

// 8. Suggestion timing on a heavier position (mid-graph, env API)
{
  // NOTE: the mixed-graph compat `ModuleNode`s are getter-facades (own keys:
  // _moduleGraph/_clientModule/_ssrModule only) — barely queryable. The
  // environment module graph holds the real nodes with own fields.
  const q = 'environments.client.moduleGraph.idToModuleMap.mapEntries().value.'
  const out = suggest(server, q, q.length)
  const values = out.suggestions.map(s => s.value)
  check(
    'suggestions mid-query over live env module graph',
    out.ok && values.includes('url'),
    out.ok ? `${out.suggestions.length} completions in ${out.statMs}ms: ${short(values.slice(0, 8), 160)}` : String(out.error),
  )
}

// ─── demo graph: normalizer battery + hazard demo ───────────────────────
const demo = createDemoGraph()

// 9. Kitchen sink normalizes and survives JSON round-trip
{
  const { data, stats } = normalize(demo, { maxDepth: 8, maxEntries: 50 })
  check(
    'kitchen-sink graph (Map/Set/circular/BigInt/Error/class) normalizes',
    isJsonSafe(data),
    `${stats.nodes} nodes, ${stats.refs} circular $refs, ${stats.truncatedEntries} entry-caps, ${stats.ms}ms`,
  )
}

// 10. Circular ref becomes $ref
{
  const out = runQuery(demo, 'circular')
  const s = JSON.stringify(out.ok ? out.result : null)
  check('circular refs -> { $ref } markers', out.ok && s.includes('$ref'), short(out.ok ? out.result : out, 200))
}

// 11. Class instance: own fields visible (incl. TS-private), proto getter invisible
{
  const out = runQuery(demo, 'store.ownKeys()')
  const keys = out.ok ? out.result as string[] : []
  check(
    'class instance: own fields queryable, proto getters invisible',
    out.ok && keys.includes('secret') && !keys.includes('upperName'),
    `ownKeys: ${short(keys, 160)}`,
  )
}

// 12. THE HAZARD: a query can invoke functions reachable in the graph
{
  const before = (demo as { destructed?: boolean }).destructed
  const out = runQuery(demo, '$f: danger.selfDestruct; $f()')
  const after = (demo as { destructed?: boolean }).destructed
  check(
    'HAZARD confirmed: query invoked a live function and mutated state',
    out.ok && before === undefined && after === true,
    `result=${short(out.ok ? out.result : out.error.message)} — on a real server this could be close(). Live-query mode must ship documented as eval-grade access.`,
  )
}

// 13. Query error surfaces cleanly (no crash)
{
  const out = runQuery(demo, 'store.entries.size()') // Map opaque to raw jora
  const outBad = runQuery(demo, 'nonexistent.method()')
  check(
    'bad queries fail soft (error envelope, process alive)',
    out.ok && !outBad.ok,
    `Map w/o helper -> ${short(out.ok ? out.result : out.error.message)}; undefined method -> ${outBad.ok ? short(outBad.result) : outBad.error.message}`,
  )
}

await server.close()

// ─── verdict ─────────────────────────────────────────────────────────────
const failed = checks.filter(c => !c.pass)
console.log('─'.repeat(72))
console.log(`SPIKE VERDICT: ${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.name}`)
  process.exitCode = 1
}

function isJsonSafe(v: unknown): boolean {
  try {
    const s = JSON.stringify(v)
    return s !== undefined && (JSON.parse(s), true)
  }
  catch {
    return false
  }
}

function byteLen(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length
  }
  catch {
    return -1
  }
}
