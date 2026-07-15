'use client'

import type { DevframeConnectionStatus } from 'devframe/client'
import { button } from '../lib/design'
import { Icon } from './ui/icon'

interface StateCopy {
  icon: string
  title: string
  body: string
  spin?: boolean
}

const COPY: Record<Exclude<DevframeConnectionStatus, 'connected'>, StateCopy> = {
  connecting: {
    icon: 'i-ph-plugs-connected-duotone',
    title: 'Connecting…',
    body: 'Establishing a connection to the devframe server.',
    spin: true,
  },
  disconnected: {
    icon: 'i-ph-plugs-duotone',
    title: 'Disconnected',
    body: 'Lost the connection to the devframe server. Reload once it is back up.',
  },
  unauthorized: {
    icon: 'i-ph-lock-key-duotone',
    title: 'Not authorized',
    body: 'This client isn’t authorized. Reopen the link printed by your dev server, then reload.',
  },
  error: {
    icon: 'i-ph-warning-octagon-duotone',
    title: 'Connection failed',
    body: 'Could not reach the devframe server.',
  },
}

/**
 * Full-panel connection state — shown whenever the client isn't `connected`,
 * so the UI never sits on an infinite spinner without saying why. Reload is the
 * recovery path (the client doesn't auto-reconnect).
 */
export function ConnectionState({ status, error }: { status: DevframeConnectionStatus, error?: string | null }) {
  if (status === 'connected')
    return null
  const copy = COPY[status]
  return (
    <div className="bg-base flex h-svh w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Icon
        name={copy.icon}
        className={`color-active size-10 ${copy.spin ? 'animate-pulse' : ''}`}
      />
      <div className="flex flex-col gap-1">
        <p className="color-base text-lg font-medium">{copy.title}</p>
        <p className="color-muted max-w-sm text-sm">{copy.body}</p>
        {error && status === 'error' && (
          <p className="color-faint mt-1 max-w-sm break-words font-mono text-xs">{error}</p>
        )}
      </div>
      {status !== 'connecting' && (
        <button type="button" className={button({ variant: 'primary', size: 'sm' })} onClick={() => location.reload()}>
          <Icon name="i-ph-arrow-clockwise" className="size-4" />
          Reload
        </button>
      )}
    </div>
  )
}
