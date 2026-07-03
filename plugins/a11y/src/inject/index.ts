/**
 * The a11y inspector **agent** — injected into the host application's page.
 *
 * It runs axe-core against the live DOM, broadcasts the report to the panel,
 * and draws a highlight ring around any element the panel asks about. It talks
 * to the panel purely over a same-origin BroadcastChannel, so it needs no
 * server — the loop works the same in dev and in a static build.
 *
 * Load it from the host page with a single module script, e.g.
 * `<script type="module" src="/__df-inject/inject.js"></script>` — or let a
 * hub load it as the a11y dock's client script, in which case the default
 * export receives the hub's client-script context and additionally mirrors
 * each scan into the hub's messages feed.
 */
import type { A11yMessage, ScanReport } from '../shared/protocol.ts'
import type { A11yAgentContext } from './messages.ts'
import { A11Y_CHANNEL } from '../shared/protocol.ts'
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

  // Booted as a hub dock client script — mirror every scan into the hub's
  // messages feed. Standalone boots have no context and skip the mirror.
  const reporter = context?.messages
    ? createMessagesReporter(context.messages, {
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

  let lastReport: ScanReport | null = null
  let scanning = false
  let rescanQueued = false
  let debounceTimer = 0

  const post = (message: A11yMessage) => channel.postMessage(message)

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

  async function runScan() {
    if (scanning) {
      rescanQueued = true
      return
    }
    scanning = true
    post({ type: 'a11y:scanning' })
    reporter?.scanning()
    // Suspend observation so attribute-stamping during the scan doesn't
    // retrigger us.
    observer.disconnect()
    try {
      lastReport = await scan()
      post({ type: 'a11y:report', report: lastReport })
      reporter?.report(lastReport)
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

  channel.addEventListener('message', (event: MessageEvent<A11yMessage>) => {
    const message = event.data
    switch (message.type) {
      case 'a11y:panel-ready':
        post({ type: 'a11y:agent-ready', url: location.href })
        if (lastReport)
          post({ type: 'a11y:report', report: lastReport })
        else
          void runScan()
        break
      case 'a11y:highlight': {
        const el = document.querySelector(`[data-df-a11y-node="${CSS.escape(message.nodeId)}"]`)
          ?? resolveElement(message.target)
        if (el) {
          const impact = findImpact(lastReport, message.nodeId) ?? 'minor'
          const ruleId = findRule(lastReport, message.nodeId) ?? 'element'
          overlay.show(el, { impact, ruleId })
        }
        else {
          overlay.hide()
        }
        break
      }
      case 'a11y:clear':
        overlay.hide()
        break
      case 'a11y:rescan':
        void runScan()
        break
    }
  })

  // Announce ourselves and run the first scan once the page has settled.
  post({ type: 'a11y:agent-ready', url: location.href })
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
