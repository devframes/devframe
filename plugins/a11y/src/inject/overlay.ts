import type { Impact } from '../shared/protocol.ts'
import { IMPACT_COLOR } from '../shared/protocol.ts'

const PREFERS_REDUCED_MOTION
  = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface HighlightInfo {
  ruleId: string
  impact: Impact
}

/** A pinned element plus its display metadata and 1-based badge number. */
export interface PinInfo extends HighlightInfo {
  el: Element
  /** 1-based badge number, unique across the whole pin set. */
  number: number
}

export interface Overlay {
  root: HTMLElement
  /** Draw the transient hover-preview ring around an element. */
  preview: (el: Element, info: HighlightInfo) => void
  /** Clear the transient hover-preview ring. */
  clearPreview: () => void
  /** Render the full set of numbered pinned rings, replacing any prior set. */
  setPins: (pins: PinInfo[]) => void
}

/** True for the document root elements we must not wrap in a full-page ring. */
function isRootElement(el: Element): boolean {
  return el === document.documentElement || el === document.body
}

interface Marker {
  box: HTMLElement
  label: HTMLElement
  el: Element | null
}

function createMarker(root: HTMLElement): Marker {
  const box = document.createElement('div')
  box.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    'border-radius:3px',
    'display:none',
    `transition:${PREFERS_REDUCED_MOTION ? 'none' : 'all .12s cubic-bezier(.4,0,.2,1)'}`,
  ].join(';')

  const label = document.createElement('div')
  label.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
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
  return { box, label, el: null }
}

/**
 * A pointer-transparent overlay drawn over the host page. It mirrors the
 * panel's "focus ring" motif: hovering a violation in the panel paints a
 * transient ring, and pinning violations paints persistent, numbered rings —
 * so a row and its highlighted element read as one object.
 *
 * Everything is inline-styled and stamped with a unique attribute so it can't
 * inherit from — or be restyled by — the host application's CSS. Root-element
 * (`<html>`/`<body>`) targets get a non-positioned corner notice instead of a
 * viewport-filling ring.
 */
export function createOverlay(): Overlay {
  const root = document.createElement('div')
  root.setAttribute('data-df-a11y-overlay', '')
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:2147483646',
    'display:block',
  ].join(';')

  // A dedicated corner notice for root-element targets that can't be ringed.
  const notice = document.createElement('div')
  notice.style.cssText = [
    'position:absolute',
    'left:12px',
    'bottom:12px',
    'max-width:320px',
    'display:none',
    'font:600 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'padding:6px 10px',
    'border-radius:6px',
    'color:#0b0e13',
    'box-shadow:0 8px 30px rgb(0 0 0 / 35%)',
  ].join(';')
  root.appendChild(notice)

  const preview = createMarker(root)
  const pins: Marker[] = []

  let rafId = 0
  let noticeText = ''

  function styleBox(marker: Marker, color: string, dim: boolean) {
    marker.box.style.border = `2px solid ${color}`
    marker.box.style.boxShadow = dim
      ? `0 0 0 3px ${color}26`
      : `0 0 0 4px ${color}33, 0 8px 30px ${color}26`
    marker.box.style.background = `${color}14`
    marker.label.style.background = color
  }

  function place(marker: Marker) {
    const el = marker.el
    if (!el)
      return
    const rect = el.getBoundingClientRect()
    const pad = 2
    marker.box.style.top = `${rect.top - pad}px`
    marker.box.style.left = `${rect.left - pad}px`
    marker.box.style.width = `${rect.width + pad * 2}px`
    marker.box.style.height = `${rect.height + pad * 2}px`
    // Flip the label below the box when it would clip past the top edge.
    marker.label.style.transform = rect.top < 22 ? 'translateY(0)' : 'translateY(-100%)'
    marker.label.style.top = rect.top < 22 ? '100%' : '0'
  }

  function placeAll() {
    if (preview.el)
      place(preview)
    for (const marker of pins) {
      if (marker.el)
        place(marker)
    }
  }

  function onViewportChange() {
    if (rafId)
      return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      placeAll()
    })
  }

  let listening = false
  function ensureListening() {
    if (listening)
      return
    listening = true
    addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    addEventListener('resize', onViewportChange, { passive: true })
  }
  function maybeStopListening() {
    if (listening && !preview.el && pins.length === 0) {
      listening = false
      removeEventListener('scroll', onViewportChange, { capture: true } as EventListenerOptions)
      removeEventListener('resize', onViewportChange)
    }
  }

  function scrollIntoViewIfNeeded(el: Element) {
    const rect = el.getBoundingClientRect()
    const offscreen = rect.bottom < 0 || rect.top > innerHeight
    if (offscreen)
      el.scrollIntoView({ block: 'center', behavior: PREFERS_REDUCED_MOTION ? 'auto' : 'smooth' })
  }

  function showNotice(color: string, text: string) {
    noticeText = text
    notice.style.background = color
    notice.textContent = text
    notice.style.display = 'block'
  }
  function hideNotice() {
    noticeText = ''
    notice.style.display = 'none'
  }

  return {
    root,

    preview(el, info) {
      if (isRootElement(el)) {
        preview.el = null
        preview.box.style.display = 'none'
        showNotice(IMPACT_COLOR[info.impact], `${info.impact} · ${info.ruleId} — whole page`)
        return
      }
      preview.el = el
      const color = IMPACT_COLOR[info.impact]
      styleBox(preview, color, false)
      preview.label.textContent = `${info.impact} · ${info.ruleId}`
      preview.box.style.display = 'block'
      ensureListening()
      scrollIntoViewIfNeeded(el)
      place(preview)
    },

    clearPreview() {
      preview.el = null
      preview.box.style.display = 'none'
      if (noticeText.includes('whole page') && pins.length === 0)
        hideNotice()
      maybeStopListening()
    },

    setPins(next) {
      // Rebuild the marker pool to match the requested pin count.
      while (pins.length < next.length)
        pins.push(createMarker(root))
      while (pins.length > next.length) {
        const marker = pins.pop()!
        marker.box.remove()
      }

      let rootPin: PinInfo | null = null
      next.forEach((pin, i) => {
        const marker = pins[i]!
        if (isRootElement(pin.el)) {
          marker.el = null
          marker.box.style.display = 'none'
          rootPin = pin
          return
        }
        marker.el = pin.el
        const color = IMPACT_COLOR[pin.impact]
        styleBox(marker, color, true)
        marker.label.textContent = `${pin.number} · ${pin.ruleId}`
        marker.box.style.display = 'block'
        place(marker)
      })

      if (rootPin)
        showNotice(IMPACT_COLOR[(rootPin as PinInfo).impact], `${(rootPin as PinInfo).number} · ${(rootPin as PinInfo).ruleId} — whole page`)
      else if (!preview.el)
        hideNotice()

      if (next.length > 0) {
        ensureListening()
        const first = next.find(p => !isRootElement(p.el))
        if (first)
          scrollIntoViewIfNeeded(first.el)
      }
      maybeStopListening()
    },
  }
}
