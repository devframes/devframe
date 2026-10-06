import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ResolvedCommand } from 'package-manager-detector'
import type { CreateOnboardingOptions, Onboarding, OnboardingHandler, OnboardingMessages, OnboardingState, OnboardingStatus } from './types'
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Diagnostic } from 'nostics'
import { diagnostics } from './diagnostics'
import { formatCommand, packagesInstalled, resolveInstallCommand, runInstall } from './install'

export type * from './types'

const STATE_FILE = 'hub-ui-onboard.json'

/** `devframes` → `/devframes/`, same rule as `normalizeHubBase` in `@devframes/hub`. */
function normalizeBase(base: string): string {
  return `/${base}/`.replace(/\/{2,}/g, '/')
}

/**
 * The built button lives next to the built entry (`dist/index.mjs` →
 * `dist/client/embedded.js`). Running from source (tests), fall back to
 * the package's `dist/`.
 */
function clientFile(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const sibling = join(here, 'client/embedded.js')
  return existsSync(sibling) ? sibling : join(here, '../dist/client/embedded.js')
}

function defaultMessages(productName: string): OnboardingMessages {
  return {
    title: productName,
    description: `${productName} enables development features in your project. Install it with:`,
    install: `Install ${productName}`,
    hide: 'Hide for now',
    disable: 'Disable entirely',
    installing: 'Installing...',
    restart: `Installed. Restart your dev server to open ${productName}.`,
    retry: 'Retry',
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * A browser sends `Origin` on every POST. Any other page on the same machine
 * must not be able to start an install, so the origin has to match the
 * request's own host (port included, which `Sec-Fetch-Site: same-site` ignores).
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin)
    return new URL(origin).host === new URL(request.url).host
  const site = request.headers.get('sec-fetch-site')
  return !site || site === 'same-origin' || site === 'none'
}

function readDisabled(file: string): boolean {
  if (!existsSync(file))
    return false
  try {
    return JSON.parse(readFileSync(file, 'utf8')).disabled === true
  }
  catch (cause) {
    diagnostics.DF9004({ file, cause })
    return false
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined)
        headers.append(name, item)
    }
  }
  const method = req.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(await req.toArray())
  return new Request(url, { method, headers, body })
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  if (!response.body) {
    res.end()
    return
  }
  // `fromWeb` wants Node's own ReadableStream type; the runtime object is the same.
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res).catch((cause: unknown) => {
    // The browser closed the connection (navigation, aborted poll); nothing is left to send.
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ERR_STREAM_PREMATURE_CLOSE'))
      throw cause
  })
}

/**
 * Create the stand-in for a hub UI that is not installed yet: a request
 * handler that serves the floating button at `<base>embedded.js` and the
 * `__onboard/*` routes it talks to.
 */
export function createOnboarding(options: CreateOnboardingOptions): Onboarding {
  if (options.packages.length === 0)
    throw diagnostics.DF9000()

  const base = normalizeBase(options.base ?? '/__devframes/')
  const cwd = options.cwd ?? process.cwd()
  const stateFile = join(options.stateDir ?? join(cwd, 'node_modules/.devframe'), STATE_FILE)
  const plan = { cwd, packages: options.packages, dev: options.dev ?? true }
  const branding = options.branding ?? {}
  const messages = { ...defaultMessages(branding.productName?.trim() || 'Devframes'), ...options.messages }

  const disabled = readDisabled(stateFile)
  const installed = !disabled && packagesInstalled(plan)
  let state: OnboardingState = disabled ? 'disabled' : installed ? 'installed' : 'idle'
  let error: OnboardingStatus['error']
  let delegate: OnboardingHandler | undefined
  let command: Promise<ResolvedCommand> | undefined
  const getCommand = () => command ??= resolveInstallCommand(plan)

  function fail(cause: unknown, fallback: () => Diagnostic): void {
    const diagnostic = cause instanceof Diagnostic ? cause : fallback()
    error = { code: diagnostic.code, message: diagnostic.message }
    state = 'error'
  }

  /** Hand the base to the host's hub, if it offers one. */
  async function activate(): Promise<void> {
    try {
      const next = await options.onInstalled?.()
      delegate = typeof next === 'function' ? next : undefined
      state = delegate ? 'ready' : 'installed'
    }
    catch (cause) {
      fail(cause, () => diagnostics.DF9003({ reason: cause instanceof Error ? cause.message : String(cause), cause }))
    }
  }

  async function install(): Promise<void> {
    state = 'installing'
    error = undefined
    let resolved: ResolvedCommand | undefined
    try {
      resolved = await getCommand()
      await runInstall(plan, resolved)
    }
    catch (cause) {
      const command = resolved ? formatCommand(resolved) : plan.packages.join(' ')
      fail(cause, () => diagnostics.DF9001({ command, exitCode: undefined, stderr: String(cause) }))
      return
    }
    await activate()
  }

  // Already installed: the hub takes over on the first request. Not earlier,
  // because the host's `onInstalled` may need a server that exists only later.
  let activated: Promise<void> | undefined

  function disable(): Response {
    try {
      mkdirSync(join(stateFile, '..'), { recursive: true })
      writeFileSync(stateFile, JSON.stringify({ disabled: true }))
    }
    catch (cause) {
      const diagnostic = diagnostics.DF9004({ file: stateFile, cause })
      return json({ code: diagnostic.code, message: diagnostic.message }, 500)
    }
    state = 'disabled'
    return new Response(null, { status: 204 })
  }

  async function status(): Promise<OnboardingStatus> {
    return { state, command: formatCommand(await getCommand()), branding, messages, error }
  }

  const handler: OnboardingHandler = async (request) => {
    if (installed)
      await (activated ??= activate())
    if (delegate)
      return delegate(request)
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith(base))
      return new Response(null, { status: 404 })
    const route = `${request.method} ${pathname.slice(base.length)}`

    if (route === 'GET embedded.js') {
      return new Response(await readFile(clientFile()), {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    if (route === 'GET __onboard/status')
      return json(await status())
    if (route === 'POST __onboard/install' || route === 'POST __onboard/disable') {
      if (!isSameOrigin(request))
        return new Response(null, { status: 403 })
      if (route.endsWith('disable'))
        return disable()
      if (state === 'idle' || state === 'error')
        void install()
      return new Response(null, { status: 202 })
    }
    return new Response(null, { status: 404 })
  }

  return {
    handler,
    nodeMiddleware(req, res, next) {
      if (!(req.url ?? '/').startsWith(base)) {
        next?.()
        return
      }
      toRequest(req)
        .then(request => handler(request))
        .then(response => sendResponse(res, response))
        .catch(cause => next ? next(cause) : res.destroy(cause))
    },
    disabled,
    installed,
    scriptSrc: `${base}embedded.js`,
  }
}
