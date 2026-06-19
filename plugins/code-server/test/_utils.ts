import type { DevframeHost, DevframeNodeContext } from 'devframe/types'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createHostContext } from 'devframe/node'

/** Minimal in-memory host — enough to drive RPC + shared state in tests. */
export function createTestHost(): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://127.0.0.1',
    getStorageDir: () => mkdtempSync(join(tmpdir(), 'dcs-store-')),
  }
}

export async function createTestContext(): Promise<DevframeNodeContext> {
  return createHostContext({ cwd: process.cwd(), mode: 'dev', host: createTestHost() })
}

export interface FakeCodeServerOptions {
  /** Version string `--version` prints; omit to make `--version` exit non-zero. */
  version?: string
  /** File the fake writes its `HASHED_PASSWORD` env to on server startup. */
  dumpEnvTo?: string
}

/**
 * Write an executable that stands in for the real `code-server`:
 *  - `--version` prints the configured version (or exits 1 when omitted);
 *  - otherwise it parses `--bind-addr host:port` and serves `/healthz` (200)
 *    until terminated, optionally dumping `HASHED_PASSWORD` to a file so tests
 *    can assert the auth wiring end to end.
 *
 * Returns the absolute path to the executable.
 */
export function writeFakeCodeServer(options: FakeCodeServerOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'dcs-bin-'))
  const binPath = join(dir, 'code-server')
  const version = options.version
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('--version')) {
  ${version ? `process.stdout.write(${JSON.stringify(`${version}\n`)}); process.exit(0)` : `process.exit(1)`}
}
const i = args.indexOf('--bind-addr')
const addr = i >= 0 ? args[i + 1] : '0.0.0.0:8080'
const port = Number(addr.split(':').pop())
const dump = ${options.dumpEnvTo ? JSON.stringify(options.dumpEnvTo) : 'null'}
if (dump) require('fs').writeFileSync(dump, process.env.HASHED_PASSWORD || '')
const http = require('http')
const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.end(req.url && req.url.startsWith('/healthz') ? '{"status":"alive"}' : 'ok')
})
server.listen(port, '0.0.0.0')
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
`
  writeFileSync(binPath, script)
  chmodSync(binPath, 0o755)

  if (process.platform === 'win32') {
    const cmdPath = `${binPath}.cmd`
    writeFileSync(cmdPath, `@node "${binPath}" %*`)
    return cmdPath
  }

  return binPath
}
