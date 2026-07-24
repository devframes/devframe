import type { AgentConfig } from '../../shared/protocol.ts'
import { defineRpcFunction } from 'devframe'
import { A11Y_CHANNEL, A11Y_DEFAULT_DOCK_ID, A11Y_NODE_ATTR, IMPACT_ORDER } from '../../shared/protocol.ts'

const IMPACT_COPY = {
  critical: {
    label: 'Critical',
    blurb: 'Blocks people with disabilities from using the page. Fix first.',
  },
  serious: {
    label: 'Serious',
    blurb: 'Severe barriers for some users; frustrating and often exclusionary.',
  },
  moderate: {
    label: 'Moderate',
    blurb: 'Causes friction and confusion, though the page stays usable.',
  },
  minor: {
    label: 'Minor',
    blurb: 'Small annoyances and polish — worth clearing once the rest is done.',
  },
} as const

/** Author-supplied runtime configuration surfaced through `get-config`. */
export interface A11yRuntimeConfig {
  /** The devframe id, so messages-feed actions can activate this dock. */
  dockId?: string
  /** Rescan on debounced user interaction (default `true`). */
  autoScan?: boolean
  /** Log newly-appeared violations to the browser console (default `true`). */
  logIssues?: boolean
  /** Auto-pin all of a route's violations the first time it's scanned (default `false`). */
  defaultHighlight?: boolean
  /** axe configuration. */
  axe?: {
    /** Rule tags to run (defaults to the broadened WCAG 2.0–2.2 + best-practice set). */
    tags?: string[]
    /** Extra axe `run` options merged over the defaults. */
    runOptions?: Record<string, unknown>
  }
}

/**
 * Build the `get-config` RPC function from author options. Declared `static`,
 * so the value resolves live over WebSocket in dev and is baked into the RPC
 * dump for static builds — the panel's legend + runtime config render the same
 * in both modes. The panel forwards the `agent` slice to the in-page agent over
 * the BroadcastChannel, keeping the agent free of any RPC dependency.
 */
export function createGetConfig(options: A11yRuntimeConfig = {}) {
  const dockId = options.dockId ?? A11Y_DEFAULT_DOCK_ID
  const agent: AgentConfig = {
    logIssues: options.logIssues ?? true,
    autoScan: options.autoScan ?? true,
    axeTags: options.axe?.tags,
    axeRunOptions: options.axe?.runOptions,
    activateDockId: dockId,
  }
  return defineRpcFunction({
    name: 'devframes:plugin:a11y:get-config',
    type: 'static',
    jsonSerializable: true,
    handler: () => ({
      channel: A11Y_CHANNEL,
      nodeAttr: A11Y_NODE_ATTR,
      docsBase: 'https://dequeuniversity.com/rules/axe/',
      dockId,
      defaultHighlight: options.defaultHighlight ?? false,
      agent,
      impacts: IMPACT_ORDER.map(id => ({ id, ...IMPACT_COPY[id] })),
    }),
  })
}

/** Default `get-config` instance — used for the RPC type augmentation. */
export const getConfig = createGetConfig()
