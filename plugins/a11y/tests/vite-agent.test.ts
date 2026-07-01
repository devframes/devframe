import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { A11Y_AGENT_PATH } from '../src/shared/protocol'
import { a11yAgent } from '../src/vite'

/** Capture the single middleware `a11yAgent()` registers, keyed by mount path. */
function captureMiddleware(plugin: ReturnType<typeof a11yAgent>) {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()
  const server = { middlewares: { use: (path: string, handler: any) => routes.set(path, handler) } }
  ;(plugin.configureServer as any)(server)
  return routes
}

/** Invoke a middleware handler against a minimal fake `res` and record what it wrote. */
function invoke(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const headers: Record<string, string> = {}
  let body = ''
  const res = {
    setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v },
    end: (chunk?: string) => { body = chunk ?? '' },
  } as unknown as ServerResponse
  handler({} as IncomingMessage, res)
  return { headers, body }
}

describe('a11yAgent() vite plugin', () => {
  it('is a dev-only plugin', () => {
    const plugin = a11yAgent()
    expect(plugin.name).toBe('devframe:a11y-agent')
    expect(plugin.apply).toBe('serve')
  })

  it('injects the agent module script at the default path', () => {
    const tags = (a11yAgent().transformIndexHtml as any)()
    expect(tags).toEqual([
      { tag: 'script', attrs: { type: 'module', src: A11Y_AGENT_PATH }, injectTo: 'body' },
    ])
  })

  it('honors a custom path for both the mount and the injected tag', () => {
    const plugin = a11yAgent({ path: '/custom/agent.js' })
    const tags = (plugin.transformIndexHtml as any)()
    expect(tags[0].attrs.src).toBe('/custom/agent.js')
    expect([...captureMiddleware(plugin).keys()]).toEqual(['/custom/agent.js'])
  })

  it('serves the bundle only when inject is false', () => {
    const plugin = a11yAgent({ inject: false })
    expect((plugin.transformIndexHtml as any)()).toBeUndefined()
    // The bundle is still mounted so a hand-placed tag can load it.
    expect(captureMiddleware(plugin).has(A11Y_AGENT_PATH)).toBe(true)
  })

  it('serves JavaScript at the mount path', () => {
    const handler = captureMiddleware(a11yAgent()).get(A11Y_AGENT_PATH)!
    const { headers, body } = invoke(handler)
    expect(headers['content-type']).toContain('javascript')
    expect(body.length).toBeGreaterThan(0)
  })
})
