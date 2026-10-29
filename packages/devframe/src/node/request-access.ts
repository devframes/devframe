import { isIP } from 'node:net'

export interface RequestAccessContext {
  remoteAddress: string
}

export interface RequestAccessPolicy {
  internalIPs?: readonly string[]
  authorize?: (context: RequestAccessContext) => boolean | Promise<boolean>
}

export function normalizeRemoteAddress(address: string | undefined): string | undefined {
  if (!address || !isIP(address))
    return undefined
  if (isIP(address) === 4)
    return address
  const [literal, scope] = address.split('%')
  const normalized = new URL(`http://[${literal}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(normalized)
  if (!mapped)
    return scope ? `${normalized}%${scope}` : normalized
  const high = Number.parseInt(mapped[1], 16)
  const low = Number.parseInt(mapped[2], 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

export function createRequestAccess(policy: RequestAccessPolicy | undefined): (remoteAddress: string | undefined) => Promise<boolean> {
  const addresses = policy?.internalIPs === undefined
    ? undefined
    : new Set(policy.internalIPs.map(normalizeRemoteAddress).filter(address => address !== undefined))
  const authorize = policy?.authorize
  return async (remoteAddress) => {
    if (!policy)
      return true
    const resolved = normalizeRemoteAddress(remoteAddress)
    if (!resolved)
      return false
    if (addresses && !addresses.has(resolved))
      return false
    return authorize ? await authorize({ remoteAddress: resolved }) === true : true
  }
}
