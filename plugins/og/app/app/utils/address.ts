/** Show a URL on `origin` as its path. A URL on another origin stays in full. */
export function formatAddress(url: string, origin: string | undefined): string {
  if (!origin)
    return url
  try {
    const parsed = new URL(url)
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : url
  }
  catch {
    return url
  }
}

/** Resolve a typed `/path` against `origin`. Any other input goes to the server as typed. */
export function resolveAddress(input: string, origin: string | undefined): string {
  const value = input.trim()
  return origin && value.startsWith('/') ? new URL(value, origin).href : value
}
