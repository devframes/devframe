/**
 * Origin and hostname predicates shared by the RPC transports (the WS upgrade,
 * SSE, and MCP origin gates) and the instance shell's authentication-link
 * origin validation. Kept dependency-free and runtime-agnostic so any consumer
 * can pull in a single check without dragging in a transport's `crossws`
 * import.
 */

/**
 * Whether `hostname` names a loopback host: `localhost` (or any `*.localhost`
 * subdomain), the IPv6 loopback `::1`, or an IPv4 literal inside the
 * `127.0.0.0/8` loopback block.
 *
 * The IPv4 case is matched **structurally**: the whole hostname must be a
 * canonical dotted-decimal IPv4 literal whose first octet is `127`. A bare
 * `startsWith('127.')` prefix check would also accept an attacker-controlled
 * DNS name that merely *begins* with `127.` (`127.attacker.example`,
 * `127.0.0.1.attacker.example`), letting a cross-origin browser page defeat
 * the loopback origin gate that guards the RPC/MCP surface (a DNS-rebinding /
 * cross-site WebSocket-hijacking bypass). Requiring a real IPv4 literal keeps
 * genuine loopback addresses (`127.0.0.1`, `127.5.5.5`) allowed while rejecting
 * those DNS names.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1')
    return true
  return isLoopbackIPv4(h)
}

/** A canonical dotted-decimal IPv4 literal in `127.0.0.0/8`. */
function isLoopbackIPv4(hostname: string): boolean {
  const octets = hostname.split('.')
  if (octets.length !== 4 || !octets.every(isDecimalOctet))
    return false
  return Number(octets[0]) === 127
}

/** A single canonical IPv4 octet: 1–3 digits, no leading zero, value 0–255. */
function isDecimalOctet(part: string): boolean {
  if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part[0] === '0'))
    return false
  return Number(part) <= 255
}

/**
 * Default origin policy for a localhost dev tool: allow requests with no
 * `Origin` header (native, non-browser clients), allow any loopback origin
 * (so cross-port localhost dev setups keep working), and allow explicitly
 * configured origins. Everything else, such as a real remote page in the dev's
 * browser, is rejected.
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin)
    return true
  if (allowedOrigins.includes(origin))
    return true
  try {
    return isLoopbackHostname(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

/**
 * Decide whether a request-derived origin candidate may back a devframe's
 * advertised public origin, the destination of the OTP magic link. Stricter
 * than {@link isAllowedOrigin}: it rejects credentials, a path, a query, a
 * fragment, a malformed port, and non-HTTP(S) schemes, and adopts a candidate
 * only when its hostname is loopback or its canonical origin exactly matches
 * an `allowedOrigins` entry (a caller with no static list passes none, so only
 * loopback qualifies). Returns the canonical origin to adopt, or `undefined`
 * to reject. Forwarded headers are never consulted.
 */
export function validateOriginCandidate(
  candidate: string,
  allowedOrigins?: readonly string[],
): string | undefined {
  let url: URL
  try {
    url = new URL(candidate)
  }
  catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return undefined
  // A canonical origin has no credentials, path, query, or fragment; any of
  // these means a full or poisoned URL, not a bare authority safe to advertise.
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== ''))
    return undefined
  const canonical = url.origin
  if (canonical === 'null')
    return undefined
  if (isLoopbackHostname(url.hostname) || allowedOrigins?.includes(canonical))
    return canonical
  return undefined
}
