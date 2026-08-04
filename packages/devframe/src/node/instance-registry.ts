import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import process from 'node:process'
import { join } from 'pathe'
import { diagnostics } from './diagnostics'

/**
 * One running devframe instance, as recorded in the instance registry.
 * Records are self-describing JSON — additive fields are safe.
 *
 * @experimental The agent-native surface is experimental and may change
 * without a major version bump until it stabilizes.
 */
export interface DevframeInstanceRecord {
  /** Process id of the dev server. */
  pid: number
  /** Listening port. */
  port: number
  /** Dialable HTTP origin, e.g. `http://127.0.0.1:9876`. */
  origin: string
  /** Base path the devframe is mounted at (trailing slash). */
  basePath: string
  /** Definition id. */
  id: string
  /** Definition display name. */
  name?: string
  /** Working directory the instance was started from. */
  rootDir: string
  /**
   * The MCP Streamable-HTTP endpoint on `origin`, or `null` when the instance
   * runs without an MCP route. `token` is the bearer credential the endpoint
   * requires (`Authorization: Bearer <token>`); it lives only in this
   * user-private registry file (written mode `0600`) so local discovery tools
   * like `devframe connect` can present it, and is never advertised over HTTP.
   */
  mcp: { path: string, token?: string } | null
  /** Epoch-ms timestamp of registration. */
  startedAt: number
}

/**
 * Handle returned by {@link registerDevframeInstance}.
 *
 * @experimental
 */
export interface DevframeInstanceRegistration {
  /** The registry file backing this registration. */
  readonly file: string
  /** Remove the record (idempotent). Call on server close. */
  unregister: () => void
}

// The env var names below are documented (READMEs, `docs/adapters/mcp.md`)
// as plain strings a user sets — nothing needs to import the constant, so
// they (and the read/probe helpers) stay internal to this module rather
// than joining the `devframe/node` public surface; see the barrel comment
// in `./index.ts`.

/** Environment variable overriding the registry directory (tests, CI). */
const DEVFRAME_INSTANCES_DIR_ENV = 'DEVFRAME_INSTANCES_DIR'
/** Environment variable disabling instance registration entirely. */
const DEVFRAME_DISABLE_INSTANCE_REGISTRY_ENV = 'DEVFRAME_DISABLE_INSTANCE_REGISTRY'

/**
 * Resolve the registry directory: `~/.devframe/instances/` by default —
 * the framework's own global dir, deliberately outside the per-app
 * `~/.<appName>/devframe/` storage convention since the registry spans apps —
 * overridable via `DEVFRAME_INSTANCES_DIR`.
 */
function resolveInstancesDir(override?: string): string {
  return override
    ?? process.env[DEVFRAME_INSTANCES_DIR_ENV]
    ?? join(homedir(), '.devframe', 'instances')
}

function isRegistryDisabled(): boolean {
  const value = process.env[DEVFRAME_DISABLE_INSTANCE_REGISTRY_ENV]
  return value === '1' || value === 'true'
}

/**
 * Record a running devframe instance in the global instance registry so
 * discovery tooling (`devframe connect`, editor integrations) can find it
 * without port guessing.
 *
 * `createDevServer` registers automatically; custom hosts that serve a
 * devframe in-process (e.g. `@devframes/next`'s host inside a Next dev
 * server) call this explicitly with the origin they are reachable at.
 *
 * The record is written atomically to `<dir>/<pid>-<port>.json` and removed
 * by {@link DevframeInstanceRegistration.unregister}. Records surviving a
 * crash are pruned by readers whose liveness probe fails. Registration never
 * throws — a write failure degrades to a coded warning (`DF0045`), since a
 * dev server must not die over discovery metadata.
 *
 * @experimental
 */
export function registerDevframeInstance(
  record: DevframeInstanceRecord,
  options: { instancesDir?: string } = {},
): DevframeInstanceRegistration {
  const dir = resolveInstancesDir(options.instancesDir)
  const file = join(dir, `${record.pid}-${record.port}.json`)

  if (!isRegistryDisabled()) {
    try {
      // The record can carry the MCP bearer token, so keep the directory and
      // file readable only by the owner (`0700`/`0600`) — the token is a
      // secret shared out-of-band with local discovery tools, never a
      // world-readable value.
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      // Atomic publish: write a temp file *in the same directory* (a rename
      // is only atomic — and only possible — within one filesystem), then
      // rename into place.
      const tmp = join(dir, `.${record.pid}-${record.port}.${Date.now()}.tmp`)
      writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
      renameSync(tmp, file)
    }
    catch (error) {
      diagnostics.DF0045({ file, reason: error instanceof Error ? error.message : String(error), cause: error })
    }
  }

  return {
    file,
    unregister: () => {
      try {
        rmSync(file, { force: true })
      }
      catch (error) {
        diagnostics.DF0045({ file, reason: error instanceof Error ? error.message : String(error), cause: error })
      }
    },
  }
}

/**
 * Read every record in the registry directory, dropping unparseable files.
 * Liveness is the caller's concern — see {@link probeDevframeInstance}.
 *
 * @experimental
 */
export function readDevframeInstances(options: { instancesDir?: string } = {}): DevframeInstanceRecord[] {
  const dir = resolveInstancesDir(options.instancesDir)
  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json'))
  }
  catch {
    return []
  }
  const records: DevframeInstanceRecord[] = []
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DevframeInstanceRecord
      if (typeof parsed?.origin === 'string' && typeof parsed?.pid === 'number')
        records.push(parsed)
    }
    catch {
      // Unparseable record (partial write from a crashed process) — skip;
      // the prune pass below removes it once its liveness probe fails.
    }
  }
  return records
}

/**
 * Dialable-origin candidates for a recorded origin. A `localhost` bind is
 * ambiguous — the server may listen on `127.0.0.1`, `::1`, or both, and
 * HTTP clients differ in which family they try — so probe the explicit
 * addresses too and adopt whichever answers.
 */
function originCandidates(origin: string): string[] {
  try {
    const url = new URL(origin)
    if (url.hostname !== 'localhost')
      return [origin]
    const port = url.port ? `:${url.port}` : ''
    return [
      origin,
      `${url.protocol}//127.0.0.1${port}`,
      `${url.protocol}//[::1]${port}`,
    ]
  }
  catch {
    return [origin]
  }
}

/**
 * A successful `__connection.json` probe: the dialable origin that
 * answered plus the parsed connection meta it served.
 *
 * @internal
 */
export interface ProbedDevframeOrigin {
  /** The origin that answered (may be an explicit address family for a `localhost` bind). */
  origin: string
  /** The parsed `__connection.json` payload (`{}` when unparseable). */
  meta: { mcp?: { path: string, port?: number } }
}

/**
 * Probe `<origin><basePath>__connection.json`, trying each dialable
 * candidate for the origin (see {@link originCandidates}). The single
 * probe primitive behind both registry liveness checks and the
 * connector's explicit `--port` probes.
 *
 * @internal
 */
export async function probeDevframeOrigin(
  origin: string,
  basePath: string,
  timeoutMs?: number,
): Promise<ProbedDevframeOrigin | null> {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`
  for (const candidate of originCandidates(origin)) {
    try {
      const response = await fetch(`${candidate}${base}__connection.json`, {
        signal: AbortSignal.timeout(timeoutMs ?? 1000),
      })
      if (!response.ok)
        continue
      const meta = await response.json().catch(() => ({})) as ProbedDevframeOrigin['meta']
      return { origin: candidate, meta }
    }
    catch {
      // Try the next candidate.
    }
  }
  return null
}

/**
 * Probe a record's `__connection.json` to check the instance is alive.
 * Returns the **dialable origin** that answered (for `localhost` records
 * this may be an explicit `127.0.0.1` / `[::1]` origin), or `null` when
 * unreachable.
 */
async function probeDevframeInstance(
  record: DevframeInstanceRecord,
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  const probed = await probeDevframeOrigin(record.origin, record.basePath, options.timeoutMs)
  return probed?.origin ?? null
}

/**
 * Read the registry and split records into live and dead by probing each
 * one's `__connection.json`, deleting dead records (prune-on-read). Live
 * records carry the dialable origin the probe confirmed (a `localhost`
 * record may come back as `127.0.0.1` / `[::1]`).
 *
 * A liveness probe only proves *something* answers on the record's port, so
 * records left behind by killed processes shadow the server currently bound
 * there: per `(port, basePath)` only the newest record survives, older
 * ghosts are pruned with the dead.
 *
 * @experimental
 */
export async function listLiveDevframeInstances(
  options: { instancesDir?: string, timeoutMs?: number } = {},
): Promise<{ live: DevframeInstanceRecord[], pruned: DevframeInstanceRecord[] }> {
  const dir = resolveInstancesDir(options.instancesDir)
  const records = readDevframeInstances({ instancesDir: dir })
  const pruned: DevframeInstanceRecord[] = []

  const prune = (record: DevframeInstanceRecord): void => {
    pruned.push(record)
    try {
      rmSync(join(dir, `${record.pid}-${record.port}.json`), { force: true })
    }
    catch {
      // Best-effort prune; a leftover file is re-pruned on the next read.
    }
  }

  // Dedup ghosts first: one record per (port, basePath), newest wins.
  const newest = new Map<string, DevframeInstanceRecord>()
  for (const record of records) {
    const key = `${record.port}|${record.basePath}`
    const existing = newest.get(key)
    if (!existing) {
      newest.set(key, record)
    }
    else if (record.startedAt > existing.startedAt) {
      prune(existing)
      newest.set(key, record)
    }
    else {
      prune(record)
    }
  }

  const live: DevframeInstanceRecord[] = []
  await Promise.all([...newest.values()].map(async (record) => {
    const origin = await probeDevframeInstance(record, options)
    if (origin)
      live.push(origin === record.origin ? record : { ...record, origin })
    else
      prune(record)
  }))
  live.sort((a, b) => a.startedAt - b.startedAt)
  return { live, pruned }
}
