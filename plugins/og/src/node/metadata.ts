import type { OgFetch, OgHeadTag, OgSnapshot } from '../types'
import { parse } from 'parse5'
import { diagnostics } from '../diagnostics'

const MAX_HTML_BYTES = 2 * 1024 * 1024
const URL_TAGS = new Set([
  'canonical',
  'icon',
  'og:image',
  'og:image:secure_url',
  'og:url',
  'twitter:image',
])

interface HtmlNode {
  nodeName: string
  tagName?: string
  attrs?: { name: string, value: string }[]
  childNodes?: HtmlNode[]
  value?: string
}

function getAttribute(node: HtmlNode, name: string): string {
  return node.attrs?.find(attribute => attribute.name === name)?.value ?? ''
}

function findElement(node: HtmlNode, name: string): HtmlNode | undefined {
  if (node.tagName === name)
    return node
  for (const child of node.childNodes ?? []) {
    const match = findElement(child, name)
    if (match)
      return match
  }
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text')
    return node.value ?? ''
  return (node.childNodes ?? []).map(textContent).join('')
}

function resolveTagValue(name: string, value: string, baseUrl: string): string {
  if (!value || (!URL_TAGS.has(name) && !name.endsWith(':image')))
    return value
  try {
    const resolved = new URL(value, baseUrl)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : ''
  }
  catch {
    return ''
  }
}

export function parseOgMetadata(html: string, url: string): OgHeadTag[] {
  const document = parse(html) as unknown as HtmlNode
  const htmlElement = findElement(document, 'html')
  const head = findElement(document, 'head')
  if (!head)
    return []

  let baseUrl = url
  const baseHref = findElement(head, 'base')
  const baseValue = baseHref ? getAttribute(baseHref, 'href') : ''
  if (baseValue) {
    try {
      baseUrl = new URL(baseValue, url).href
    }
    catch {}
  }

  const tags: OgHeadTag[] = []
  if (htmlElement) {
    const lang = getAttribute(htmlElement, 'lang')
    if (lang)
      tags.push({ tag: 'html', name: 'lang', value: lang })
  }

  function visit(node: HtmlNode): void {
    if (node.tagName === 'title') {
      const value = textContent(node).trim()
      if (value)
        tags.push({ tag: 'title', name: 'title', value })
    }
    else if (node.tagName === 'meta') {
      const property = getAttribute(node, 'property')
      const metaName = getAttribute(node, 'name')
      const charset = getAttribute(node, 'charset')
      const name = (property || metaName || (charset ? 'charset' : '')).toLowerCase()
      const rawValue = getAttribute(node, 'content') || charset
      const value = resolveTagValue(name, rawValue, baseUrl)
      if (name && value)
        tags.push({ tag: 'meta', name, value })
    }
    else if (node.tagName === 'link') {
      const name = getAttribute(node, 'rel').toLowerCase()
      const value = resolveTagValue(name, getAttribute(node, 'href'), baseUrl)
      if (name && value)
        tags.push({ tag: 'link', name, value })
    }

    for (const child of node.childNodes ?? [])
      visit(child)
  }
  visit(head)

  return tags
}

function normalizeUrl(input: string): string {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `http://${input}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new TypeError('Unsupported protocol')
    return url.href
  }
  catch {
    throw diagnostics.DP_OG_0001({ url: input })
  }
}

async function readHtml(response: Response, url: string): Promise<string> {
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_HTML_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw diagnostics.DP_OG_0004({ url, size: declaredSize })
  }

  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body?.getReader()
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > MAX_HTML_BYTES) {
        await reader.cancel().catch(() => {})
        throw diagnostics.DP_OG_0004({ url, size })
      }
      chunks.push(value)
    }
  }

  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  const contentType = response.headers.get('content-type') ?? ''
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]
  const asciiHead = new TextDecoder('windows-1252').decode(buffer.subarray(0, 2048))
  const documentCharset = asciiHead.match(/<meta\s[^>]*charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1]
  try {
    return new TextDecoder(headerCharset || documentCharset || 'utf-8').decode(buffer)
  }
  catch {
    return new TextDecoder().decode(buffer)
  }
}

export async function fetchOgMetadata(
  input: string,
  fetcher: OgFetch = globalThis.fetch,
): Promise<OgSnapshot> {
  const requestedUrl = normalizeUrl(input.trim())
  let response: Response
  try {
    response = await fetcher(requestedUrl, {
      headers: {
        'accept': 'text/html,application/xhtml+xml',
        'user-agent': 'devframe-og/0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch (error) {
    throw diagnostics.DP_OG_0002({
      url: requestedUrl,
      reason: error instanceof Error ? error.message : String(error),
      cause: error,
    })
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw diagnostics.DP_OG_0003({ url: requestedUrl, status: response.status })
  }

  const resolvedUrl = response.url || requestedUrl
  let html: string
  try {
    html = await readHtml(response, requestedUrl)
  }
  catch (error) {
    if (error instanceof Error && error.name === 'DP_OG_0004')
      throw error
    throw diagnostics.DP_OG_0002({
      url: requestedUrl,
      reason: error instanceof Error ? error.message : String(error),
      cause: error,
    })
  }
  return {
    requestedUrl,
    url: resolvedUrl,
    status: response.status,
    fetchedAt: Date.now(),
    tags: parseOgMetadata(html, resolvedUrl),
  }
}
