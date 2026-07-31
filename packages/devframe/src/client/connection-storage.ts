import type { ConnectionMeta } from 'devframe/types'
import type { DevframeConnection } from './connection'
import { DEVFRAME_CONNECTION_KEY } from 'devframe/constants'

const CONNECTION_META_KEY = '__DEVFRAME_CONNECTION_META__'
const CONNECTION_AUTH_TOKEN_KEY = '__DEVFRAME_CONNECTION_AUTH_TOKEN__'

function readFromWindows<T>(key: string): T | undefined {
  const getters = [
    () => (window as any)?.[key],
    () => (globalThis as any)?.[key],
    () => (parent.window as any)?.[key],
  ]

  for (const getter of getters) {
    try {
      const value = getter()
      if (value)
        return value as T
    }
    catch {}
  }
}

export function readStoredConnection(): DevframeConnection | undefined {
  return readFromWindows<DevframeConnection>(DEVFRAME_CONNECTION_KEY)
}

export function readStoredConnectionMeta(): (ConnectionMeta & { baseUrl?: string }) | undefined {
  return readFromWindows<ConnectionMeta & { baseUrl?: string }>(CONNECTION_META_KEY)
}

export function readStoredAuthToken(userAuthToken?: string): string | undefined {
  if (userAuthToken)
    return userAuthToken

  try {
    const token = localStorage.getItem(CONNECTION_AUTH_TOKEN_KEY)
    if (token)
      return token
  }
  catch {}

  return readFromWindows<string>(CONNECTION_AUTH_TOKEN_KEY)
}

export function storeConnection(connection: DevframeConnection): void {
  ;(globalThis as any)[DEVFRAME_CONNECTION_KEY] = connection
  // Keep the established metadata/auth globals in sync for viewers that still
  // consume the legacy handoff directly.
  ;(globalThis as any)[CONNECTION_META_KEY] = {
    ...connection.connectionMeta,
    baseUrl: connection.metaBaseUrl,
  }
  if (connection.authToken)
    storeAuthToken(connection.authToken)
}

export function storeAuthToken(token: string): void {
  try {
    localStorage.setItem(CONNECTION_AUTH_TOKEN_KEY, token)
  }
  catch {}
  ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = token

  const connection = readStoredConnection()
  if (connection) {
    ;(globalThis as any)[DEVFRAME_CONNECTION_KEY] = {
      ...connection,
      authToken: token,
    }
  }
}
