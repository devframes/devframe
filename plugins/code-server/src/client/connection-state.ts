import type { DevframeConnectionStatus } from 'devframe/client'
import { button, cx } from './design'

interface StateCopy {
  icon: string
  title: string
  body: string
}

const COPY: Record<Exclude<DevframeConnectionStatus, 'connected'>, StateCopy> = {
  connecting: {
    icon: 'i-ph-plugs-connected-duotone',
    title: 'Connecting…',
    body: 'Establishing a connection to the devframe server.',
  },
  disconnected: {
    icon: 'i-ph-plugs-duotone',
    title: 'Disconnected',
    body: 'Lost the connection to the devframe server. Reload once it is back up.',
  },
  unauthorized: {
    icon: 'i-ph-lock-key-duotone',
    title: 'Not authorized',
    body: 'Reopen the link printed by your dev server, then reload.',
  },
  error: {
    icon: 'i-ph-warning-octagon-duotone',
    title: 'Connection failed',
    body: 'Could not reach the devframe server.',
  },
}

export interface ConnectionStateHandle {
  /** Render for a status. Returns `true` when it took over the container. */
  update: (status: DevframeConnectionStatus, error?: string | null) => boolean
  dispose: () => void
}

/**
 * A full-container connection state, shown whenever the devframe client isn't
 * `connected` so the launcher never sits on an unexplained blank while the
 * socket is down. Reload is the recovery path (no auto-reconnect).
 */
export function createConnectionState(container: HTMLElement): ConnectionStateHandle {
  const root = document.createElement('div')
  root.className = 'absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base color-base p-8 text-center z-nav'
  root.hidden = true
  container.append(root)

  function update(status: DevframeConnectionStatus, error?: string | null): boolean {
    if (status === 'connected') {
      root.hidden = true
      root.replaceChildren()
      return false
    }
    const copy = COPY[status]
    root.replaceChildren()

    const glyph = document.createElement('div')
    glyph.className = cx(copy.icon, 'text-4xl color-active')
    root.append(glyph)

    const text = document.createElement('div')
    text.className = 'flex flex-col gap-1'
    const title = document.createElement('p')
    title.className = 'text-lg font-medium'
    title.textContent = copy.title
    const body = document.createElement('p')
    body.className = 'text-sm color-muted max-w-sm'
    body.textContent = copy.body
    text.append(title, body)
    if (error && status === 'error') {
      const code = document.createElement('code')
      code.className = 'mt-1 max-w-sm break-words font-mono text-xs color-faint'
      code.textContent = error
      text.append(code)
    }
    root.append(text)

    if (status !== 'connecting') {
      const reload = document.createElement('button')
      reload.type = 'button'
      reload.className = button({ variant: 'primary', size: 'sm' })
      reload.textContent = 'Reload'
      reload.addEventListener('click', () => location.reload())
      root.append(reload)
    }

    root.hidden = false
    return true
  }

  return {
    update,
    dispose() {
      root.remove()
    },
  }
}
