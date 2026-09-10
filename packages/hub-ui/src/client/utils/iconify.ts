import createDOMPurify from 'dompurify'

const getIconifySvgMap = new Map<string, Promise<string> | string>()

const purify = createDOMPurify()

export async function getIconifySvg(collection: string, icon: string) {
  const id = `${collection}:${icon}`
  if (getIconifySvgMap.has(id)) {
    return getIconifySvgMap.get(id)!
  }
  const promise = _get()
    .then((svg) => {
      getIconifySvgMap.set(id, svg)
      return svg
    })
    .catch((err) => {
      // Don't cache failures; drop the entry so a later render can retry.
      getIconifySvgMap.delete(id)
      throw err
    })
  getIconifySvgMap.set(id, promise)
  return promise

  async function _get() {
    const url = `https://api.iconify.design/${collection}/${icon}.svg?color=currentColor&width=100%`
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok)
      throw new Error(`Iconify request failed: ${response.status}`)
    const svg = purify.sanitize(await response.text())
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    if (document.documentElement.localName !== 'svg'
      || document.querySelector('parsererror')
      || !document.querySelector('path, circle, ellipse, rect, line, polyline, polygon, text, use, image')) {
      throw new Error('Iconify returned an invalid SVG')
    }
    return svg
  }
}
