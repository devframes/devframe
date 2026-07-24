/**
 * Wire contract shared by the two browser-side halves of the a11y inspector:
 *
 *  - the **agent** — injected into the host application's page, runs axe-core,
 *    tracks issues per route, and owns the highlight overlay (`src/inject`);
 *  - the **panel** — the Solid SPA that lists violations (`src/client`).
 *
 * They talk over a same-origin {@link https://developer.mozilla.org/docs/Web/API/BroadcastChannel BroadcastChannel}
 * rather than the devframe RPC backend. That keeps the live scan/highlight loop
 * working identically whether the plugin is running as a dev server (WebSocket
 * RPC) or as a baked static build — neither half needs a server to find the
 * other, only a shared browser origin (host page + devtools iframe).
 *
 * The agent owns the authoritative route → report map (backed by
 * sessionStorage) and broadcasts the whole {@link A11yState} aggregate on every
 * change, so the panel stays a pure render of it. Runtime configuration
 * (`get-config`, a `static` RPC the panel resolves) is forwarded to the agent
 * over the same channel as an {@link AgentConfig}, keeping the agent itself
 * free of any RPC dependency.
 */

/** BroadcastChannel name. Namespaced with the devframe id, per convention. */
export const A11Y_CHANNEL = 'devframes:plugin:a11y'

/** Default dock id — the devframe id a hub registers the panel under. */
export const A11Y_DEFAULT_DOCK_ID = 'devframes_plugin_a11y'

/** sessionStorage key the agent persists its route → report map under. */
export const A11Y_STORAGE_KEY = 'devframes:plugin:a11y:routes'

/** Shared-state slot the hub mirrors the active dock activation into. */
export const A11Y_DOCKS_ACTIVE_KEY = 'devframe:docks:active'

/**
 * Attribute the agent stamps on each violating element so the panel can ask
 *  for a stable target that survives re-scans and DOM reshuffles.
 */
export const A11Y_NODE_ATTR = 'data-df-a11y-node'

/**
 * Default axe rule tags the scanner runs. Broadened past the strict WCAG A/AA
 * set to include WCAG 2.2 and best-practice rules — the best-practice ones are
 * flagged ({@link Violation.bestPractice}) so the panel can filter them out.
 */
export const DEFAULT_AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
  'best-practice',
] as const

/** axe-core impact buckets, ordered most → least severe. */
export const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const
export type Impact = (typeof IMPACT_ORDER)[number]

/**
 * Severity palette — the one expressive, domain-specific color in the tool.
 * Shared by both halves so the panel chips/spines and the in-page highlight
 * ring (drawn by the injected agent via inline styles) stay in lockstep.
 */
export const IMPACT_COLOR: Record<Impact, string> = {
  critical: '#ff5c7a',
  serious: '#ff9b52',
  moderate: '#f2d14e',
  minor: '#6fb1fc',
}

export interface ViolationNode {
  /** Stable id the agent assigned (mirrored to {@link A11Y_NODE_ATTR}). */
  id: string
  /** axe target selector(s) that resolve to the element. */
  target: string[]
  /** Trimmed `outerHTML` of the element, for display. */
  html: string
  /** axe's per-node failure summary. */
  failureSummary: string
}

export interface Violation {
  /** axe rule id, e.g. `"image-alt"`. */
  ruleId: string
  impact: Impact
  /** One-line, human-facing summary of the rule. */
  help: string
  /** Longer description of what the rule checks. */
  description: string
  /** Deque University rule documentation. */
  helpUrl: string
  /** WCAG tags the rule maps to, e.g. `["wcag2a", "wcag111"]`. */
  tags?: string[]
  /** Whether this is an axe best-practice rule rather than a WCAG success criterion. */
  bestPractice?: boolean
  nodes: ViolationNode[]
}

export interface ScanReport {
  /** Route bucket key — `location.pathname` of the scanned document. */
  route: string
  /** Full location of the scanned document. */
  url: string
  /** Epoch ms the scan finished. */
  scannedAt: number
  /** axe engine version that produced the report. */
  engine: string
  violations: Violation[]
  /** Total violating nodes per impact bucket. */
  counts: Record<Impact, number>
}

/**
 * The whole route → report aggregate the agent broadcasts. `routes` holds one
 * report per tracked route; `activeRoute` is the pathname currently in view in
 * the host page.
 */
export interface A11yState {
  /** axe engine version (from the most recent scan). */
  engine: string
  /** `location.pathname` currently in view in the host page. */
  activeRoute: string
  /** One report per tracked route. */
  routes: ScanReport[]
}

/** A single element to pin/highlight, carried from panel to agent. */
export interface PinTarget {
  /** Node id from {@link ViolationNode.id}. */
  nodeId: string
  /** axe target selector(s); the fallback when the id no longer resolves. */
  target: string[]
  impact: Impact
  ruleId: string
}

/**
 * Runtime configuration the panel resolves from the `get-config` RPC and
 * forwards to the agent over the channel (the agent keeps no RPC dependency).
 */
export interface AgentConfig {
  /** Log newly-appeared violations to the browser console. */
  logIssues: boolean
  /** Rescan on debounced user interaction, on top of the DOM MutationObserver. */
  autoScan: boolean
  /** axe rule tags to run (defaults to {@link DEFAULT_AXE_TAGS}). */
  axeTags?: string[]
  /** Extra axe `run` options merged over the defaults. */
  axeRunOptions?: Record<string, unknown>
  /**
   * Dock id the messages-feed navigation actions target (the devframe id).
   * Defaults to {@link A11Y_DEFAULT_DOCK_ID}.
   */
  activateDockId?: string
}

/* ── agent → panel ─────────────────────────────────────────────────────── */

export interface AgentReadyMessage {
  type: 'a11y:agent-ready'
  url: string
  route: string
}
export interface StateMessage {
  type: 'a11y:state'
  state: A11yState
}
export interface ScanningMessage {
  type: 'a11y:scanning'
  route: string
}

export type AgentToPanel = AgentReadyMessage | StateMessage | ScanningMessage

/* ── panel → agent ─────────────────────────────────────────────────────── */

export interface PanelReadyMessage {
  type: 'a11y:panel-ready'
}
export interface ConfigMessage {
  type: 'a11y:config'
  config: AgentConfig
}
export interface HighlightMessage {
  type: 'a11y:highlight'
  /** Node id from {@link ViolationNode.id}; falls back to the first target. */
  nodeId: string
  target: string[]
}
export interface ClearHighlightMessage {
  type: 'a11y:clear'
}
export interface PinsMessage {
  type: 'a11y:pins'
  /** The full desired pin set; the agent draws numbered rings in this order. */
  pins: PinTarget[]
}
export interface RescanMessage {
  type: 'a11y:rescan'
}
export interface SetAutoScanMessage {
  type: 'a11y:set-autoscan'
  enabled: boolean
}
export interface ClearRouteMessage {
  type: 'a11y:clear-route'
  route: string
}
export interface ClearAllMessage {
  type: 'a11y:clear-all'
}

export type PanelToAgent
  = | PanelReadyMessage
    | ConfigMessage
    | HighlightMessage
    | ClearHighlightMessage
    | PinsMessage
    | RescanMessage
    | SetAutoScanMessage
    | ClearRouteMessage
    | ClearAllMessage

export type A11yMessage = AgentToPanel | PanelToAgent

/** Empty per-impact counter — handy initial value. */
export function emptyCounts(): Record<Impact, number> {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 }
}

/** Roll the per-impact counts of many reports into one total. */
export function sumCounts(reports: ScanReport[]): Record<Impact, number> {
  const total = emptyCounts()
  for (const report of reports) {
    for (const impact of IMPACT_ORDER)
      total[impact] += report.counts[impact]
  }
  return total
}
