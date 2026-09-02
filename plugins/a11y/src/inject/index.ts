/**
 * The a11y inspector **page script** - injected into the user app's page.
 *
 * It runs axe-core against the live DOM, tracks violations per route, owns
 * the whole {@link A11yState} aggregate as the in-page channel's shared
 * state, and draws transient + pinned highlight rings around elements the
 * panel asks about. It talks to the panel purely over devframe's in-page
 * channel (`devframe/in-page-channel`), so it needs no server - the loop
 * works the same in dev and in a static build, and every connected panel
 * (dock iframe, popup, Document PiP) converges on the same state.
 *
 * Load it from the host page with a single module script, e.g.
 * `<script type="module" src="/__df-inject/inject.js"></script>` - or let a
 * hub load it as the a11y dock's client script, in which case the default
 * export receives the hub's client-script context and additionally mirrors
 * each scan into the hub's messages feed.
 */
import type { A11yChannelProtocol, PageScriptConfig, PinTarget, ScanReport } from '../shared/protocol.ts'
import type { A11yPageScriptContext } from './messages.ts'
import type { PinInfo } from './overlay.ts'
import { createPageScriptChannel } from 'devframe/in-page-channel'
import {
  A11Y_CHANNEL,
  A11Y_DEFAULT_DOCK_ID,
  A11Y_NODE_ATTR,
  A11Y_STORAGE_KEY,
} from '../shared/protocol.ts'
import { createMessagesReporter } from './messages.ts'
import { createOverlay } from './overlay.ts'
import { resolveElement, scan } from './scanner.ts'

const GLOBAL_FLAG = '__DF_A11Y_PAGE_SCRIPT__'

async function start(context?: A11yPageScriptContext): Promise<void> {
  const w = window as typeof window & { [GLOBAL_FLAG]?: boolean }
  if (w[GLOBAL_FLAG])
    return
  w[GLOBAL_FLAG] = true

  const overlay = createOverlay()
  document.documentElement.appendChild(overlay.root)

  // Booted as a hub dock client script - mirror the active route's scan into
  // the hub's messages feed. Standalone boots have no context and skip it.
  const config: PageScriptConfig = { logIssues: true, autoScan: true }

  const reporter = context?.messages
    ? createMessagesReporter(context.messages, {
        dockId: () => config.activateDockId ?? A11Y_DEFAULT_DOCK_ID,
        resolveBoundingBox: (target) => {
          const rect = resolveElement(target)?.getBoundingClientRect()
          if (!rect)
            return undefined
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        },
      })
    : undefined

  // Authoritative route → report map, persisted so history survives reloads /
  // MPA navigations within the tab session.
  const routes = new Map<string, ScanReport>(loadRoutes())
  /** Rule ids logged to the console per route, to dedupe under auto-scan. */
  const loggedRules = new Map<string, Set<string>>()
  let activeRoute = location.pathname
  let engine = routes.get(activeRoute)?.engine ?? 'unknown'

  let scanning = false
  let rescanQueued = false
  let debounceTimer = 0

  function loadRoutes(): [string, ScanReport][] {
    try {
      const raw = sessionStorage.getItem(A11Y_STORAGE_KEY)
      if (!raw)
        return []
      const parsed = JSON.parse(raw) as ScanReport[]
      return parsed.map(report => [report.route, report])
    }
    catch {
      return []
    }
  }
  function saveRoutes() {
    try {
      sessionStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify([...routes.values()]))
    }
    catch {
      // Storage full/unavailable - history is best-effort, carry on.
    }
  }

  const channel = createPageScriptChannel<A11yChannelProtocol>({
    name: A11Y_CHANNEL,
    functions: {
      'highlight': {
        type: 'event',
        jsonSerializable: true,
        handler: (nodeId: string, target: string[]) => {
          const el = document.querySelector(`[${A11Y_NODE_ATTR}="${CSS.escape(nodeId)}"]`)
            ?? resolveElement(target)
          if (el) {
            const active = routes.get(activeRoute) ?? null
            const impact = findImpact(active, nodeId) ?? 'minor'
            const ruleId = findRule(active, nodeId) ?? 'element'
            overlay.preview(el, { impact, ruleId })
          }
          else {
            overlay.clearPreview()
          }
        },
      },
      'clear-highlight': {
        type: 'event',
        handler: () => overlay.clearPreview(),
      },
      'set-pins': {
        type: 'event',
        jsonSerializable: true,
        handler: (pins: PinTarget[]) => {
          const infos: PinInfo[] = []
          pins.forEach((pin, i) => {
            const info = resolvePin(pin, i + 1)
            if (info)
              infos.push(info)
          })
          overlay.setPins(infos)
        },
      },
      'rescan': {
        type: 'event',
        handler: () => void runScan(),
      },
      'set-config': {
        type: 'event',
        handler: (next: PageScriptConfig) => applyConfig(next),
      },
      'set-autoscan': {
        type: 'event',
        jsonSerializable: true,
        handler: (enabled: boolean) => {
          config.autoScan = enabled
          if (enabled)
            bindInteractions()
          else
            unbindInteractions()
        },
      },
      'clear-route': {
        type: 'event',
        jsonSerializable: true,
        handler: (route: string) => {
          routes.delete(route)
          loggedRules.delete(route)
          saveRoutes()
          publishState()
        },
      },
      'clear-all': {
        type: 'event',
        handler: () => {
          routes.clear()
          loggedRules.clear()
          saveRoutes()
          publishState()
        },
      },
    },
  })

  // The page script is the authority for the aggregate; connected panels are
  // seeded on handshake and converge through patches.
  const state = await channel.sharedState.get('state', {
    initialValue: { engine, activeRoute, scanning: false, routes: [...routes.values()] },
  })
  function publishState() {
    state.mutate((draft) => {
      draft.engine = engine
      draft.activeRoute = activeRoute
      draft.scanning = scanning
      draft.routes = [...routes.values()]
    })
  }

  const observer = new MutationObserver((records) => {
    // Ignore our own overlay mutations; everything else may have changed the
    // accessibility tree, so debounce a fresh scan.
    const relevant = records.some(r => !overlay.root.contains(r.target as Node))
    if (relevant)
      scheduleScan()
  })

  function observe() {
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['alt', 'role', 'aria-label', 'aria-labelledby', 'for', 'href', 'src', 'title', 'lang', 'type'],
    })
  }

  function scheduleScan() {
    clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(runScan, 600)
  }

  // Interaction-driven rescans, layered on top of the DOM observer. Bound only
  // while auto-scan is enabled.
  const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const
  const onInteraction = () => scheduleScan()
  let interactionsBound = false
  function bindInteractions() {
    if (interactionsBound || !config.autoScan)
      return
    interactionsBound = true
    for (const type of INTERACTION_EVENTS)
      addEventListener(type, onInteraction, { passive: true, capture: true })
  }
  function unbindInteractions() {
    if (!interactionsBound)
      return
    interactionsBound = false
    for (const type of INTERACTION_EVENTS)
      removeEventListener(type, onInteraction, { capture: true } as EventListenerOptions)
  }

  function logNewIssues(report: ScanReport) {
    if (!config.logIssues)
      return
    const previous = loggedRules.get(report.route) ?? new Set<string>()
    const current = new Set(report.violations.map(v => v.ruleId))
    const fresh = report.violations.filter(v => !previous.has(v.ruleId))
    loggedRules.set(report.route, current)
    if (fresh.length === 0)
      return
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `%c a11y %c ${fresh.length} new issue${fresh.length === 1 ? '' : 's'} on ${report.route}`,
      'background:#6fb07d;color:#0b0e13;border-radius:3px;padding:1px 4px;font-weight:700',
      'color:inherit',
    )
    for (const v of fresh) {
      // eslint-disable-next-line no-console
      console.log(
        `%c${v.impact}%c ${v.ruleId} - ${v.help} (${v.nodes.length})\n${v.helpUrl}`,
        'font-weight:700',
        'font-weight:400',
      )
    }
    // eslint-disable-next-line no-console
    console.groupEnd()
  }

  async function runScan() {
    if (scanning) {
      rescanQueued = true
      return
    }
    scanning = true
    activeRoute = location.pathname
    publishState()
    reporter?.scanning()
    // Suspend observation so attribute-stamping during the scan doesn't
    // retrigger us.
    observer.disconnect()
    try {
      const report = await scan({ tags: config.axeTags, runOptions: config.axeRunOptions })
      engine = report.engine
      routes.set(report.route, report)
      activeRoute = report.route
      saveRoutes()
      logNewIssues(report)
      reporter?.report(report)
    }
    catch (error) {
      console.error('[a11y-inspector] scan failed', error)
      reporter?.failed(error)
    }
    finally {
      observe()
      scanning = false
      publishState()
      if (rescanQueued) {
        rescanQueued = false
        scheduleScan()
      }
    }
  }

  // ── route tracking ──────────────────────────────────────────────────────
  // Framework-neutral: patch the History API + listen for popstate/hashchange,
  // and bucket by pathname. A new route resets pins (panel-driven) and scans.
  function onLocationChange() {
    if (location.pathname === activeRoute)
      return
    activeRoute = location.pathname
    overlay.setPins([])
    publishState()
    scheduleScan()
  }
  const origPush = history.pushState
  const origReplace = history.replaceState
  history.pushState = function pushState(...args: Parameters<History['pushState']>) {
    const result = origPush.apply(this, args)
    onLocationChange()
    return result
  }
  history.replaceState = function replaceState(...args: Parameters<History['replaceState']>) {
    const result = origReplace.apply(this, args)
    onLocationChange()
    return result
  }
  addEventListener('popstate', onLocationChange)
  addEventListener('hashchange', onLocationChange)

  // ── pins / preview ──────────────────────────────────────────────────────
  function resolvePin(pin: PinTarget, number: number): PinInfo | null {
    const el = document.querySelector(`[${A11Y_NODE_ATTR}="${CSS.escape(pin.nodeId)}"]`)
      ?? resolveElement(pin.target)
    if (!el)
      return null
    return { el, impact: pin.impact, ruleId: pin.ruleId, number }
  }

  function applyConfig(next: PageScriptConfig) {
    config.logIssues = next.logIssues
    config.axeTags = next.axeTags
    config.axeRunOptions = next.axeRunOptions
    config.activateDockId = next.activateDockId
    config.autoScan = next.autoScan
    if (config.autoScan)
      bindInteractions()
    else
      unbindInteractions()
  }

  // A panel with nothing to show yet triggers the first scan; state replay to
  // late joiners is the channel's job.
  channel.events.on('panel:connected', () => {
    if (routes.size === 0 && !scanning)
      void runScan()
  })

  bindInteractions()

  // Run the first scan once the page has settled.
  if (document.readyState === 'complete')
    void runScan()
  else
    addEventListener('load', () => void runScan(), { once: true })
}

function findImpact(report: ScanReport | null, nodeId: string) {
  return report?.violations.find(v => v.nodes.some(n => n.id === nodeId))?.impact
}
function findRule(report: ScanReport | null, nodeId: string) {
  return report?.violations.find(v => v.nodes.some(n => n.id === nodeId))?.ruleId
}

/**
 * Client-script entry the hub runtime calls after importing this module,
 * passing its `DockClientScriptContext`. The live scan/highlight loop rides
 * the in-page channel either way; when the context carries a `messages`
 * client (duck-typed - see {@link A11yPageScriptContext}), the page script
 * additionally mirrors each scan into the hub's messages feed. `start()` is
 * idempotent.
 */
export default function runA11yPageScript(context?: A11yPageScriptContext): void {
  void start(context)
}

// Also self-boot so a plain `<script type="module" src=".../inject.js">`
// (the standalone demo, any non-hub host page) starts the page script on load - deferred
// one macrotask so a hub host that imports this module calls the default
// export (microtask-chained after the import) first, letting the context-ful
// boot win the `__DF_A11Y_PAGE_SCRIPT__` guard.
setTimeout(start, 0)
