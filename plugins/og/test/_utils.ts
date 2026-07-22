import type { StartedServer } from 'devframe/node'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createOgDevframe } from '@devframes/plugin-og'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createH3DevframeHost, createHostContext, startHttpAndWs } from 'devframe/node'
import { resolveBasePath } from 'devframe/node/hub-internals'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'

export async function testFetch(_url: string): Promise<Response> {
  return new Response(`<!doctype html>
    <html lang="en"><head>
      <title>OG test</title>
      <meta property="og:title" content="OG test card">
      <meta property="og:image" content="/card.png">
    </head></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

export const testDevframe = createOgDevframe({ fetch: testFetch })

export function assertSpaBuilt(): void {
  const distDir = testDevframe.cli!.distDir
  if (!distDir || !existsSync(path.join(distDir, 'index.html')))
    throw new Error('Open Graph SPA missing. Run the plugin build first.')
}

export interface OgServer extends StartedServer {
  basePath: string
}

export async function startOgServer(): Promise<OgServer> {
  const distDir = testDevframe.cli!.distDir!
  const basePath = resolveBasePath(testDevframe, 'standalone')
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })
  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: testDevframe.id,
    mount: (base, dir) => mountStaticHandler(app, base, dir),
  })
  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await testDevframe.setup(ctx)
  app.use(`${basePath}${DEVFRAME_CONNECTION_META_FILENAME}`, () => ({ backend: 'websocket', websocket: port }))
  mountStaticHandler(app, basePath, path.resolve(distDir))
  const server = await startHttpAndWs({ context: ctx, host, port, app, auth: false })
  return Object.assign(server, { basePath })
}
