/**
 * The a11y inspector **agent** — injected into the host application's page.
 *
 * It runs axe-core against the live DOM, tracks violations per route, broadcasts
 * the whole {@link A11yState} aggregate to the panel, and draws transient +
 * pinned highlight rings around elements the panel asks about. It talks to the
 * panel purely over a same-origin BroadcastChannel, so it needs no server — the
 * loop works the same in dev and in a static build.
 *
 * Load it from the host page with a single module script, e.g.
 * `<script type="module" src="/__df-inject/inject.js"></script>` — or let a
 * hub load it as the a11y dock's client script, in which case the default
 * export receives the hub's client-script context and additionally mirrors
 * each scan into the hub's messages feed.
 */
import type {
  A11yMessage,
  A11yState,
  AgentConfig,
  PinTarget,
  ScanReport,
} from '../shared/protocol.ts'
import type { A11yAgentContext } from './messages.ts'
import type { PinInfo } from './overlay.ts'
import {
  A11Y_CHANNEL,
  A11Y_DEFAULT_DOCK_ID,
  A11Y_NODE_ATTR,
  A11Y_STORAGE_KEY,
} from '../shared/protocol.ts'
import { createMessagesReporter } from './messages.ts'
import { createOverlay } from './overlay.ts'
import { resolveElement, scan } from './scanner.ts'

const GLOBAL_FLAG = '__DF_A11Y_AGENT__'

function start(context?: A11yAgentContext) {
  const w = window as unknown as Record<string, unknown>
  if (w[GLOBAL_FLAG])
    return
  w[GLOBAL_FLAG] = true

  const channel = new BroadcastChannel(A11Y_CHANNEL)
  const overlay = createOverlay()
  document.documentElement.appendChild(overlay.root)

  // Booted as a hub dock client script — mirror the active route's scan into
  // the hub's messages feed. Standalone boots have no context and skip it.
  const config: AgentConfig = { logIssues: true, autoScan: true }

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

  const post = (message: A11yMessage) => channel.postMessage(message)

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
      // Storage full/unavailable — history is best-effort, carry on.
    }
  }

  function buildState(): A11yState {
    return { engine, activeRoute, routes: [...routes.values()] }
  }
  function broadcastState() {
    post({ type: 'a11y:state', state: buildState() })
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
        `%c${v.impact}%c ${v.ruleId} — ${v.help} (${v.nodes.length})\n${v.helpUrl}`,
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
    post({ type: 'a11y:scanning', route: activeRoute })
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
      broadcastState()
      reporter?.report(report)
    }
    catch (error) {
      console.error('[a11y-inspector] scan failed', error)
      reporter?.failed(error)
    }
    finally {
      observe()
      scanning = false
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
    broadcastState()
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

  channel.addEventListener('message', (event: MessageEvent<A11yMessage>) => {
    const message = event.data
    switch (message.type) {
      case 'a11y:panel-ready':
        post({ type: 'a11y:agent-ready', url: location.href, route: activeRoute })
        if (routes.size > 0)
          broadcastState()
        else
          void runScan()
        break
      case 'a11y:config':
        applyConfig(message.config)
        break
      case 'a11y:highlight': {
        const el = document.querySelector(`[${A11Y_NODE_ATTR}="${CSS.escape(message.nodeId)}"]`)
          ?? resolveElement(message.target)
        if (el) {
          const active = routes.get(activeRoute) ?? null
          const impact = findImpact(active, message.nodeId) ?? 'minor'
          const ruleId = findRule(active, message.nodeId) ?? 'element'
          overlay.preview(el, { impact, ruleId })
        }
        else {
          overlay.clearPreview()
        }
        break
      }
      case 'a11y:clear':
        overlay.clearPreview()
        break
      case 'a11y:pins': {
        const infos: PinInfo[] = []
        message.pins.forEach((pin, i) => {
          const info = resolvePin(pin, i + 1)
          if (info)
            infos.push(info)
        })
        overlay.setPins(infos)
        break
      }
      case 'a11y:rescan':
        void runScan()
        break
      case 'a11y:set-autoscan':
        config.autoScan = message.enabled
        if (message.enabled)
          bindInteractions()
        else
          unbindInteractions()
        break
      case 'a11y:clear-route':
        routes.delete(message.route)
        loggedRules.delete(message.route)
        saveRoutes()
        broadcastState()
        break
      case 'a11y:clear-all':
        routes.clear()
        loggedRules.clear()
        saveRoutes()
        broadcastState()
        break
    }
  })

  function applyConfig(next: AgentConfig) {
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

  bindInteractions()

  // Announce ourselves and run the first scan once the page has settled.
  post({ type: 'a11y:agent-ready', url: location.href, route: activeRoute })
  if (routes.size > 0)
    broadcastState()
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
 * the same-origin BroadcastChannel either way; when the context carries a
 * `messages` client (duck-typed — see {@link A11yAgentContext}), the agent
 * additionally mirrors each scan into the hub's messages feed. `start()` is
 * idempotent.
 */
export default function runA11yAgent(context?: A11yAgentContext): void {
  start(context)
}

// Also self-boot so a plain `<script type="module" src=".../inject.js">`
// (the standalone demo, any non-hub host) starts the agent on load — deferred
// one macrotask so a hub host that imports this module calls the default
// export (microtask-chained after the import) first, letting the context-ful
// boot win the `__DF_A11Y_AGENT__` guard.
setTimeout(start, 0)
