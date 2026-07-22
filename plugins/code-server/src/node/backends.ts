import type { CodeServerBackend, CodeServerConnect, CodeServerLogin, CodeServerMode } from '../types'
import { createHash } from 'node:crypto'

/**
 * The internal launch profile the supervisor drives. One of three "kinds":
 * the two local {@link CodeServerBackend}s plus the `code tunnel` profile
 * selected by `mode: 'tunnel'`. Each profile owns the backend-specific pieces
 * — binary, arguments, auth env, readiness detection, and how the client
 * ultimately reaches the editor — while the supervisor owns the shared
 * spawn / log / publish lifecycle.
 */
export type CodeServerProfileKind = 'code-server' | 'serve-web' | 'tunnel'

/** Everything a profile needs to build a launch and the client's connect info. */
export interface ProfileContext {
  host: string
  /** Resolved local port (0 until dynamically allocated). Unused by tunnel. */
  port: number
  folder: string
  /** Fresh per-launch secret (session token / connection token). */
  secret: string
  /** Session cookie name for the `code-server` backend. */
  cookieName: string
  extraArgs: string[]
  /** Machine name for the tunnel profile. */
  tunnelName: string
}

export interface CodeServerProfile {
  kind: CodeServerProfileKind
  /** Public backend id (tunnel reports `ms-code-serve-web`'s sibling `code` binary). */
  backend: CodeServerBackend
  /** Default binary when the caller doesn't override `bin`. */
  defaultBin: string
  /** Build the argv passed to the binary. */
  buildArgs: (c: ProfileContext) => string[]
  /** Merge auth material into the child environment. */
  buildEnv: (c: ProfileContext, base: Record<string, string>) => Record<string, string>
  /** Local readiness path polled over HTTP, or `null` for log-driven (tunnel). */
  healthPath: string | null
  /** Parse a log line for a dynamically-bound local port. */
  matchPort?: (line: string) => number | undefined
  /** Parse a log line for the tunnel's `vscode.dev` URL (marks it ready). */
  matchReadyUrl?: (line: string) => string | undefined
  /** Parse a log line for a device-login prompt. */
  matchLogin?: (line: string) => CodeServerLogin | undefined
  /** Compute the client connect descriptor for a freshly launched server. */
  connect: (c: ProfileContext & { readyUrl?: string }) => CodeServerConnect
  /** Connect descriptor for an adopted (reused) server we didn't launch. */
  connectReused: (c: { port: number }) => CodeServerConnect
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Coder's open-source `code-server`, with password auth + session cookie handoff. */
const codeServerProfile: CodeServerProfile = {
  kind: 'code-server',
  backend: 'code-server',
  defaultBin: 'code-server',
  buildArgs: c => [
    '--auth',
    'password',
    '--bind-addr',
    `${c.host}:${c.port}`,
    '--disable-telemetry',
    '--disable-update-check',
    ...c.extraArgs,
    c.folder,
  ],
  buildEnv: (c, base) => {
    const env = { ...base }
    delete env.PASSWORD
    // code-server compares the session cookie against HASHED_PASSWORD, so the
    // cookie value handed to the client is exactly this hash.
    env.HASHED_PASSWORD = sha256(c.secret)
    return env
  },
  healthPath: '/healthz',
  matchPort: (line) => {
    const m = line.match(/HTTP server listening on https?:\/\/(?:[^:]+|\[[^\]]+\]):(\d+)/)
    return m ? Number.parseInt(m[1], 10) : undefined
  },
  connect: c => ({ path: '/', cookie: { name: c.cookieName, value: sha256(c.secret) } }),
  connectReused: () => ({ path: '/' }),
}

/** Microsoft's `code serve-web`, with a connection token passed via `?tkn=`. */
const serveWebProfile: CodeServerProfile = {
  kind: 'serve-web',
  backend: 'ms-code-serve-web',
  defaultBin: 'code',
  buildArgs: c => [
    'serve-web',
    '--accept-server-license-terms',
    '--host',
    c.host,
    '--port',
    String(c.port),
    '--connection-token',
    c.secret,
    ...c.extraArgs,
  ],
  buildEnv: (_c, base) => ({ ...base }),
  // serve-web has no health endpoint; the root responds (200/redirect) once up.
  healthPath: '/',
  matchPort: (line) => {
    const m = line.match(/available at https?:\/\/[^:]+:(\d+)/i)
    return m ? Number.parseInt(m[1], 10) : undefined
  },
  connect: c => ({ path: `/?tkn=${encodeURIComponent(c.secret)}&folder=${encodeURIComponent(c.folder)}` }),
  connectReused: () => ({ path: '/' }),
}

const TUNNEL_URL_RE = /(https:\/\/vscode\.dev\/tunnel\/\S+)/
const DEVICE_LOGIN_RE = /log in(?:to)? (https?:\/\/\S+) and use code ([A-Z0-9-]+)/i

/** Microsoft's `code tunnel`, embedding the hosted `vscode.dev` editor. */
const tunnelProfile: CodeServerProfile = {
  kind: 'tunnel',
  backend: 'ms-code-serve-web',
  defaultBin: 'code',
  buildArgs: c => [
    'tunnel',
    '--accept-server-license-terms',
    '--name',
    c.tunnelName,
    ...c.extraArgs,
  ],
  buildEnv: (_c, base) => ({ ...base }),
  healthPath: null,
  matchReadyUrl: (line) => {
    const m = line.match(TUNNEL_URL_RE)
    return m ? m[1].replace(/[)\].,]+$/, '') : undefined
  },
  matchLogin: (line) => {
    const m = line.match(DEVICE_LOGIN_RE)
    return m ? { url: m[1], code: m[2] } : undefined
  },
  connect: c => ({ url: c.readyUrl ?? `https://vscode.dev/tunnel/${c.tunnelName}${c.folder}` }),
  connectReused: () => ({}),
}

const LOCAL_PROFILES: Record<CodeServerBackend, CodeServerProfile> = {
  'code-server': codeServerProfile,
  'ms-code-serve-web': serveWebProfile,
}

/** The ordered auto-detection candidates for `mode: 'local'` with no explicit backend. */
export const AUTO_DETECT_ORDER: CodeServerBackend[] = ['code-server', 'ms-code-serve-web']

/** Resolve the launch profile for a mode + backend. */
export function resolveProfile(mode: CodeServerMode, backend: CodeServerBackend): CodeServerProfile {
  return mode === 'tunnel' ? tunnelProfile : LOCAL_PROFILES[backend]
}
