import { describe, expect, it } from 'vitest'
import { fetchOgMetadata, parseOgMetadata } from '../src/node/metadata'

describe('open Graph metadata', () => {
  it('normalizes relevant head tags and resolves relative URLs', () => {
    const tags = parseOgMetadata(`<!doctype html>
      <html lang="en-GB">
        <head>
          <base href="/docs/">
          <title>Devframe &amp; Friends</title>
          <meta name="description" content="Portable devtools">
          <meta property="og:title" content="A social title">
          <meta property="og:image" content="card.png">
          <meta name="twitter:card" content="summary_large_image">
          <link rel="icon" href="/favicon.png">
        </head>
      </html>`, 'https://example.com/guide')

    expect(tags).toEqual([
      { tag: 'html', name: 'lang', value: 'en-GB' },
      { tag: 'title', name: 'title', value: 'Devframe & Friends' },
      { tag: 'meta', name: 'description', value: 'Portable devtools' },
      { tag: 'meta', name: 'og:title', value: 'A social title' },
      { tag: 'meta', name: 'og:image', value: 'https://example.com/docs/card.png' },
      { tag: 'meta', name: 'twitter:card', value: 'summary_large_image' },
      { tag: 'link', name: 'icon', value: 'https://example.com/favicon.png' },
    ])
  })

  it('accepts a localhost shorthand and fetches HTML', async () => {
    const calls: string[] = []
    const snapshot = await fetchOgMetadata('localhost:4321/about', async (url) => {
      calls.push(url)
      return new Response('<head><title>Local page</title></head>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })

    expect(calls).toEqual(['http://localhost:4321/about'])
    expect(snapshot).toMatchObject({
      requestedUrl: 'http://localhost:4321/about',
      url: 'http://localhost:4321/about',
      status: 200,
      tags: [{ tag: 'title', name: 'title', value: 'Local page' }],
    })
  })

  it('rejects unsupported URL protocols', async () => {
    await expect(fetchOgMetadata('file:///tmp/index.html')).rejects.toThrow(/valid HTTP or HTTPS URL/)
  })

  it('uses HTML parsing semantics and excludes unsafe metadata URLs', () => {
    const tags = parseOgMetadata(`<html><head>
      <!-- <meta property="og:title" content="commented"> -->
      <script>const ignored = '<meta property="og:title" content="script">'</script>
      <meta property="og:title" content="A > B">
      <meta property="og:url" content="javascript:alert(1)">
    </head></html>`, 'https://example.com')

    expect(tags).toEqual([
      { tag: 'meta', name: 'og:title', value: 'A > B' },
    ])
  })

  it('rejects declared and streamed responses over 2 MB', async () => {
    await expect(fetchOgMetadata('https://example.com', async () => new Response('', {
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    }))).rejects.toThrow(/exceeds the 2 MB inspection limit/)

    const chunk = new Uint8Array(1024 * 1024 + 1)
    await expect(fetchOgMetadata('https://example.com', async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      },
    })))).rejects.toThrow(/exceeds the 2 MB inspection limit/)
  })

  it('decodes metadata with the declared response charset', async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<head><title>Caf'),
      0xE9,
      ...new TextEncoder().encode('</title></head>'),
    ])
    const snapshot = await fetchOgMetadata('https://example.com', async () => new Response(bytes, {
      headers: { 'content-type': 'text/html; charset=windows-1252' },
    }))
    expect(snapshot.tags).toContainEqual({ tag: 'title', name: 'title', value: 'Café' })
  })
})
