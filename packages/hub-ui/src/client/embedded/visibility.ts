import type { EmbeddedVisibility } from '../../types'
import { HUB_UI_HIDE_EVENT } from '../constants'

/** Per-origin persisted reveal flag for `passive` mode. */
const REVEAL_STORAGE_KEY = 'devframes-dock-revealed'

function readPersistedReveal(): boolean {
  try {
    return localStorage.getItem(REVEAL_STORAGE_KEY) === 'true'
  }
  catch {
    return false
  }
}

function persistReveal(revealed: boolean): void {
  try {
    if (revealed)
      localStorage.setItem(REVEAL_STORAGE_KEY, 'true')
    else
      localStorage.removeItem(REVEAL_STORAGE_KEY)
  }
  catch {
    // Private-mode / disabled storage: reveal stays session-only, which is a
    // safe degradation, since the dock is still reachable via the shortcut.
  }
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
}

/** The reveal shortcut label, `Shift+Alt+D` (`⇧⌥D` on macOS). */
function revealShortcutLabel(): string {
  return isMac() ? '⇧⌥D' : 'Shift+Alt+D'
}

function printHint(label: string): void {
  // Intentional user-facing hint (not a diagnostic): the whole point of
  // passive mode is this one console line pointing at the reveal shortcut.
  // eslint-disable-next-line no-console
  console.info(
    `%c${label}%c is in passive mode; press %c${revealShortcutLabel()}%c to reveal the devtools.`,
    'font-weight:bold',
    '',
    'font-weight:bold',
    '',
  )
}

/** `true` when the event is the reveal chord (Shift+Alt+D), layout-agnostic. */
function isRevealChord(e: KeyboardEvent): boolean {
  return e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyD'
}

export interface EmbeddedVisibilityHandlers {
  /** Mount/attach the dock element. */
  show: () => void
  /** Detach the dock element. */
  hide: () => void
}

export function isEmbeddedDockInitiallyVisible(mode: EmbeddedVisibility): boolean {
  return mode === 'normal' || (mode === 'passive' && readPersistedReveal())
}

/**
 * Drive the embedded dock's reveal lifecycle for the resolved
 * {@link EmbeddedVisibility} mode: decide whether to show on boot, wire the
 * reveal shortcut and the "Hide" command's {@link HUB_UI_HIDE_EVENT}, and
 * persist the reveal for `passive`.
 *
 * `label` is the resolved product name, used in the passive-mode console hint.
 */
export function setupEmbeddedVisibility(
  mode: EmbeddedVisibility,
  label: string,
  handlers: EmbeddedVisibilityHandlers,
): void {
  let shown = isEmbeddedDockInitiallyVisible(mode)

  function reveal(): void {
    if (shown)
      return
    shown = true
    if (mode === 'passive')
      persistReveal(true)
    handlers.show()
  }

  function conceal(): void {
    if (!shown)
      return
    shown = false
    // `normal`/`hidden` hide for the session only; `passive` remembers it so
    // the next load starts hidden again.
    if (mode === 'passive')
      persistReveal(false)
    handlers.hide()
  }

  if (shown)
    handlers.show()
  else if (mode === 'passive')
    printHint(label)

  // Shift+Alt+D toggles the dock, the always-available "summon" chord.
  window.addEventListener('keydown', (e) => {
    if (!isRevealChord(e))
      return
    e.preventDefault()
    if (shown)
      conceal()
    else
      reveal()
  }, { capture: true })

  // The in-dock "Hide" command asks to conceal (reload/shortcut brings it back).
  window.addEventListener(HUB_UI_HIDE_EVENT, conceal)
}
