'use client'

import type { DevframeConnectionStatus } from 'devframe/client'
import { button, connectionBody, connectionDetail, connectionGlyph, connectionPanel, connectionState, connectionTitle } from '../lib/design'
import { Icon } from './ui/icon'

/**
 * Full-panel connection state — shown whenever the client isn't `connected`, so
 * the UI never sits on an infinite spinner without saying why. Copy and layout
 * come from the shared `design/design.ts` so every surface looks identical;
 * reload is the recovery path (the client doesn't auto-reconnect).
 */
export function ConnectionState({ status, error }: { status: DevframeConnectionStatus, error?: string | null }) {
  const copy = connectionState(status)
  if (!copy)
    return null
  return (
    <div className={connectionPanel('h-svh w-full')}>
      <Icon name={copy.icon} className={connectionGlyph(copy.spin)} />
      <div className="flex flex-col gap-1">
        <p className={connectionTitle()}>{copy.title}</p>
        <p className={connectionBody()}>{copy.body}</p>
        {error && status === 'error' && (
          <p className={connectionDetail()}>{error}</p>
        )}
      </div>
      {copy.reloadable && (
        <button type="button" className={button({ variant: 'primary', size: 'sm' })} onClick={() => location.reload()}>
          <Icon name="i-ph-arrow-clockwise" className="size-4" />
          Reload
        </button>
      )}
    </div>
  )
}
