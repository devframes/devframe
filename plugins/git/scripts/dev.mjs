// Runs the devframe RPC/WebSocket backend and the Next.js dev server (with
// HMR) together. Open the UI URL printed below; the client connects to the
// backend over WebSocket via NEXT_PUBLIC_DEVFRAME_WS.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const host = process.env.HOST ?? '0.0.0.0'
const serverPort = process.env.DEVFRAME_GIT_PORT ?? '9710'
const clientPort = process.env.PORT ?? '3000'
// Resolve the Next.js bin explicitly so this works regardless of PATH.
const nextBin = require.resolve('next/dist/bin/next')

const children = [
  // RPC + WebSocket backend (devframe). Serves the prebuilt SPA too, but in
  // dev you open the Next server below for hot-reloading.
  spawn(process.execPath, ['src/cli.ts', '--port', serverPort, '--host', host], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }),
  // Next.js dev server (HMR). Points the client at the backend WebSocket.
  spawn(process.execPath, [nextBin, 'dev', 'src/client', '--port', clientPort, '--hostname', host], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_DEVFRAME_WS: serverPort },
  }),
]

console.error(`\n  @devframes/plugin-git dev`)
console.error(`  UI (HMR):    http://localhost:${clientPort}`)
console.error(`  RPC backend: http://localhost:${serverPort}\n`)

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown)
    return
  shuttingDown = true
  for (const child of children)
    child.kill('SIGTERM')
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
for (const child of children) {
  child.on('exit', code => shutdown(code ?? 0))
  child.on('error', (error) => {
    console.error(error)
    shutdown(1)
  })
}
