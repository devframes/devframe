import type { AssetsServer, TestClient } from './_utils'
import { Buffer } from 'node:buffer'
import fsp from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootClient, call, cleanupTempDir, createTempDir, startAssetsServer } from './_utils'

const describeSymlinks = process.platform === 'win32' ? describe.skip : describe

// A minimal, valid 1x1 PNG.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
)

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate())
      return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('waitFor: timed out')
}

async function upload(client: TestClient, path: string, bytes: Uint8Array): Promise<void> {
  const { uploadId } = await call<{ uploadId: string }>(client, 'devframes:plugin:assets:upload', { path })
  const sink = client.streaming.upload<Uint8Array>('devframes:plugin:assets:upload', uploadId)
  sink.write(bytes)
  sink.close()
  // The server-side write is async (fire-and-forget inside the handler), so
  // give the write stream a tick to flush before the caller asserts on disk.
  await new Promise(resolve => setTimeout(resolve, 50))
}

describe('assets plugin', () => {
  let dir: string
  let server: AssetsServer
  let client: TestClient

  // Deleted once at the very end, not per-test: deleting a directory right
  // after closing its chokidar watcher can trip a native libuv assertion on
  // Windows (see `watchAssetsDir`'s disposer). Deferring keeps that race out.
  const tempDirs: string[] = []

  beforeEach(async () => {
    dir = await createTempDir()
    tempDirs.push(dir)
  })

  afterEach(async () => {
    await server?.close()
  })

  afterAll(async () => {
    await Promise.all(tempDirs.map(cleanupTempDir))
  })

  it('lists no assets in an empty directory', async () => {
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)
    const list = await call(client, 'devframes:plugin:assets:list')
    expect(list).toEqual([])
  })

  it('reports write capabilities by default', async () => {
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)
    const caps = await call(client, 'devframes:plugin:assets:capabilities')
    expect(caps).toEqual({ write: true, uploadExtensions: expect.any(Array) })
  })

  it('creates a folder and uploads a file into it via the streaming channel', async () => {
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    await call(client, 'devframes:plugin:assets:mkdir', { path: 'icons' })
    await upload(client, 'icons/logo.png', ONE_PIXEL_PNG)

    const list = await call(client, 'devframes:plugin:assets:list')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ path: 'icons/logo.png', type: 'image', size: ONE_PIXEL_PNG.length })
    expect(await fsp.readFile(join(dir, 'icons/logo.png'))).toEqual(ONE_PIXEL_PNG)
  })

  it('reads image dimensions for an uploaded image', async () => {
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)
    await upload(client, 'logo.png', ONE_PIXEL_PNG)

    const meta = await call(client, 'devframes:plugin:assets:read-image-meta', 'logo.png')
    expect(meta).toMatchObject({ width: 1, height: 1 })
  })

  it('reads text content for a text asset', async () => {
    await fsp.writeFile(join(dir, 'notes.txt'), 'hello world', 'utf-8')
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    const content = await call(client, 'devframes:plugin:assets:read-text', 'notes.txt')
    expect(content).toBe('hello world')
  })

  it('renames an asset within its folder', async () => {
    await fsp.mkdir(join(dir, 'icons'), { recursive: true })
    await fsp.writeFile(join(dir, 'icons/old.txt'), 'x', 'utf-8')
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    const renamed = await call(client, 'devframes:plugin:assets:rename', { path: 'icons/old.txt', newName: 'new' })
    expect(renamed.path).toBe('icons/new.txt')
    await expect(fsp.access(join(dir, 'icons/new.txt'))).resolves.toBeUndefined()
    await expect(fsp.access(join(dir, 'icons/old.txt'))).rejects.toThrow()
  })

  it('rejects renaming onto an existing file', async () => {
    await fsp.writeFile(join(dir, 'a.txt'), 'a', 'utf-8')
    await fsp.writeFile(join(dir, 'b.txt'), 'b', 'utf-8')
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    await expect(call(client, 'devframes:plugin:assets:rename', { path: 'a.txt', newName: 'b' })).rejects.toThrow()
  })

  it('deletes one or more assets in a single call', async () => {
    await fsp.writeFile(join(dir, 'a.txt'), 'a', 'utf-8')
    await fsp.writeFile(join(dir, 'b.txt'), 'b', 'utf-8')
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    const result = await call(client, 'devframes:plugin:assets:delete', { paths: ['a.txt', 'b.txt', 'missing.txt'] })
    expect(result.deleted.sort()).toEqual(['a.txt', 'b.txt'])
    expect(await call(client, 'devframes:plugin:assets:list')).toEqual([])
  })

  it('rejects paths that escape the managed directory', async () => {
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)

    await expect(call(client, 'devframes:plugin:assets:read-text', '../../etc/passwd')).resolves.toBeNull()
    await expect(
      call(client, 'devframes:plugin:assets:rename', { path: '../../etc/passwd', newName: 'x' }),
    ).rejects.toThrow(/outside the managed directory/)
  })

  describeSymlinks('symlink containment', () => {
    let outside: string

    beforeEach(async () => {
      outside = await createTempDir()
      tempDirs.push(outside)
      await fsp.writeFile(join(outside, 'secret.txt'), 'top secret', 'utf-8')
    })

    it('does not read through an escaping ancestor-directory symlink', async () => {
      await fsp.symlink(outside, join(dir, 'escape'))
      server = await startAssetsServer(dir, { watch: false })
      client = bootClient(server.port)

      await expect(
        call(client, 'devframes:plugin:assets:read-text', 'escape/secret.txt'),
      ).resolves.toBeNull()
    })

    it('reads a symlink whose canonical target stays inside the managed root', async () => {
      await fsp.writeFile(join(dir, 'real.txt'), 'contained', 'utf-8')
      await fsp.symlink(join(dir, 'real.txt'), join(dir, 'alias.txt'))
      server = await startAssetsServer(dir, { watch: false })
      client = bootClient(server.port)

      await expect(
        call(client, 'devframes:plugin:assets:read-text', 'alias.txt'),
      ).resolves.toBe('contained')
    })

    it('omits symlink entries from the listing', async () => {
      await fsp.writeFile(join(dir, 'real.txt'), 'x', 'utf-8')
      await fsp.symlink(join(dir, 'real.txt'), join(dir, 'alias.txt'))
      await fsp.symlink(outside, join(dir, 'escape'))
      server = await startAssetsServer(dir, { watch: false })
      client = bootClient(server.port)

      const list = await call(client, 'devframes:plugin:assets:list')
      expect(list.map((a: { path: string }) => a.path)).toEqual(['real.txt'])
    })

    it('rejects a mutation through an escaping ancestor-directory symlink', async () => {
      await fsp.symlink(outside, join(dir, 'escape'))
      server = await startAssetsServer(dir, { watch: false })
      client = bootClient(server.port)

      await expect(
        call(client, 'devframes:plugin:assets:upload', { path: 'escape/evil.txt' }),
      ).rejects.toThrow(/outside the managed directory/)
      await expect(
        call(client, 'devframes:plugin:assets:mkdir', { path: 'escape/sub' }),
      ).rejects.toThrow(/outside the managed directory/)
      await expect(
        call(client, 'devframes:plugin:assets:delete', { paths: ['escape/secret.txt'] }),
      ).rejects.toThrow(/outside the managed directory/)
    })

    it('rejects a mutation onto a symlink even when its target stays in-root', async () => {
      await fsp.writeFile(join(dir, 'real.txt'), 'x', 'utf-8')
      await fsp.symlink(join(dir, 'real.txt'), join(dir, 'alias.txt'))
      server = await startAssetsServer(dir, { watch: false })
      client = bootClient(server.port)

      await expect(
        call(client, 'devframes:plugin:assets:delete', { paths: ['alias.txt'] }),
      ).rejects.toThrow(/outside the managed directory/)
      await expect(
        call(client, 'devframes:plugin:assets:rename', { path: 'alias.txt', newName: 'renamed' }),
      ).rejects.toThrow(/outside the managed directory/)
    })
  })

  it('rejects uploads with a disallowed extension', async () => {
    server = await startAssetsServer(dir, { uploadExtensions: ['png'], watch: false })
    client = bootClient(server.port)

    await expect(
      call(client, 'devframes:plugin:assets:upload', { path: 'script.exe' }),
    ).rejects.toThrow(/not allowed/)
  })

  it('does not register write actions when write is disabled', async () => {
    server = await startAssetsServer(dir, { write: false, watch: false })
    client = bootClient(server.port)

    const caps = await call(client, 'devframes:plugin:assets:capabilities')
    expect(caps.write).toBe(false)
    await expect(call(client, 'devframes:plugin:assets:mkdir', { path: 'x' })).rejects.toThrow()
  })

  it('installs the open wire service (regardless of write) for the client to call directly', async () => {
    server = await startAssetsServer(dir, { write: false, watch: false })

    // Assets no longer wraps open-in-editor/reveal-in-folder; it declares
    // `@devframes/service-open` (with the managed dir as an allowed root),
    // which the client calls directly with the asset's absolute `fsPath`.
    // The service is constructed before setup and its scoped RPC registered,
    // regardless of `write`; the write actions must not be.
    const defs = server.ctx.rpc.definitions
    expect(server.ctx.services.has('@devframes/service-open')).toBe(true)
    expect(defs.has('devframes:service:open:open-in-editor')).toBe(true)
    expect(defs.has('devframes:service:open:open-in-finder')).toBe(true)
    expect(defs.has('devframes:plugin:assets:mkdir')).toBe(false)
  })

  it('exposes an absolute fsPath on listed assets in dev mode', async () => {
    await fsp.writeFile(join(dir, 'note.txt'), 'hello')
    server = await startAssetsServer(dir, { watch: false })
    client = bootClient(server.port)
    const assets = await call(client, 'devframes:plugin:assets:list')
    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets)
      expect(asset.fsPath && isAbsolute(asset.fsPath)).toBeTruthy()
  })

  // The only test that opens a live fs watch handle (others use `watch: false`).
  // Skipped on Windows: closing then deleting a `ReadDirectoryChangesW` watch's
  // directory intermittently trips a native libuv assertion that hard-aborts the
  // process, consistent with Defender racing the watch/delete. Covered on Linux/macOS.
  it.skipIf(process.platform === 'win32')('broadcasts a change event when a file is added on disk', async () => {
    server = await startAssetsServer(dir)
    client = bootClient(server.port)

    let changed = false
    client.onEvent('devframes:plugin:assets:changed', () => {
      changed = true
    })

    // `broadcast()` only reaches clients the server already knows about, so a
    // round trip first guarantees the WS handshake has completed before the
    // watcher fires, otherwise the (unqueued, unreplayed) event is dropped.
    await call(client, 'devframes:plugin:assets:list')

    await fsp.writeFile(join(dir, 'new-file.txt'), 'x', 'utf-8')
    await waitFor(() => changed)
    expect(await call(client, 'devframes:plugin:assets:list')).toHaveLength(1)
  })
})
