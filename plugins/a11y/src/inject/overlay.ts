import type { Impact } from '../shared/protocol.ts'
import { IMPACT_COLOR } from '../shared/protocol.ts'

const PREFERS_REDUCED_MOTION
  = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface HighlightInfo {
  ruleId: string
  impact: Impact
}

export interface Overlay {
  root: HTMLElement
  show: (el: Element, info: HighlightInfo) => void
  hide: () => void
}

/**
 * A pointer-transparent overlay drawn over the host page. It mirrors the
 * panel's "focus ring" motif: hovering a violation in the panel paints the
 * same ring around the offending element here, tying the list back to the page.
 *
 * Everything is inline-styled and stamped with a unique attribute so it can't
 * inherit from — or be restyled by — the host application's CSS.
 */
export function createOverlay(): Overlay {
  const root = document.createElement('div')
  root.setAttribute('data-df-a11y-overlay', '')
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:2147483646',
    'contain:strict',
    'display:none',
  ].join(';')

  const box = document.createElement('div')
  box.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    'border-radius:3px',
    `transition:${PREFERS_REDUCED_MOTION ? 'none' : 'all .12s cubic-bezier(.4,0,.2,1)'}`,
  ].join(';')

  const label = document.createElement('div')
  label.style.cssText = [
    'position:absolute',
    'left:0',
    'transform:translateY(-100%)',
    'font:600 11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:.02em',
    'padding:1px 7px',
    'border-radius:3px 3px 3px 0',
    'white-space:nowrap',
    'color:#0b0e13',
  ].join(';')

  box.appendChild(label)
  root.appendChild(box)

  let current: Element | null = null
  let rafId = 0

  function place() {
    if (!current)
      return
    const rect = current.getBoundingClientRect()
    const pad = 2
    box.style.top = `${rect.top - pad}px`
    box.style.left = `${rect.left - pad}px`
    box.style.width = `${rect.width + pad * 2}px`
    box.style.height = `${rect.height + pad * 2}px`
    // Flip the label below the box when it would clip past the top edge.
    label.style.transform = rect.top < 22 ? 'translateY(0)' : 'translateY(-100%)'
    label.style.top = rect.top < 22 ? '100%' : '0'
  }

  function onViewportChange() {
    if (rafId)
      return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      place()
    })
  }

  function show(el: Element, info: HighlightInfo) {
    current = el
    const color = IMPACT_COLOR[info.impact]
    box.style.border = `2px solid ${color}`
    box.style.boxShadow = `0 0 0 4px ${color}33, 0 8px 30px ${color}26`
    box.style.background = `${color}14`
    label.style.background = color
    label.textContent = `${info.impact} · ${info.ruleId}`

    root.style.display = 'block'
    // Bring the target into view if it is off-screen.
    const rect = el.getBoundingClientRect()
    const offscreen = rect.bottom < 0 || rect.top > innerHeight
    if (offscreen)
      el.scrollIntoView({ block: 'center', behavior: PREFERS_REDUCED_MOTION ? 'auto' : 'smooth' })
    place()

    addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    addEventListener('resize', onViewportChange, { passive: true })
  }

  function hide() {
    current = null
    root.style.display = 'none'
    removeEventListener('scroll', onViewportChange, { capture: true } as EventListenerOptions)
    removeEventListener('resize', onViewportChange)
  }

  return { root, show, hide }
}
