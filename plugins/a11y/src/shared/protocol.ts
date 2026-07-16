/**
 * Wire contract shared by the two browser-side halves of the a11y inspector:
 *
 *  - the **agent** — injected into the host application's page, runs axe-core
 *    and owns the highlight overlay (`src/inject`);
 *  - the **panel** — the Solid SPA that lists violations (`src/client`).
 *
 * They talk over a same-origin {@link https://developer.mozilla.org/docs/Web/API/BroadcastChannel BroadcastChannel}
 * rather than the devframe RPC backend. That keeps the live scan/highlight loop
 * working identically whether the plugin is running as a dev server (WebSocket
 * RPC) or as a baked static build — neither half needs a server to find the
 * other, only a shared browser origin (host page + devtools iframe).
 *
 * devframe RPC still carries the data model on top of this: `get-config`
 * (rule catalogue + impact metadata) is a `static` function, so it resolves
 * live in dev and from the baked dump in a static build.
 */

/** BroadcastChannel name. Namespaced with the devframe id, per convention. */
export const A11Y_CHANNEL = 'devframes:plugin:a11y'

/**
 * Attribute the agent stamps on each violating element so the panel can ask
 *  for a stable target that survives re-scans and DOM reshuffles.
 */
export const A11Y_NODE_ATTR = 'data-df-a11y-node'

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
  nodes: ViolationNode[]
}

export interface ScanReport {
  /** Location of the scanned document. */
  url: string
  /** Epoch ms the scan finished. */
  scannedAt: number
  /** axe engine version that produced the report. */
  engine: string
  violations: Violation[]
  /** Total violating nodes per impact bucket. */
  counts: Record<Impact, number>
}

/* ── agent → panel ─────────────────────────────────────────────────────── */

export interface AgentReadyMessage {
  type: 'a11y:agent-ready'
  url: string
}
export interface ReportMessage {
  type: 'a11y:report'
  report: ScanReport
}
export interface ScanningMessage {
  type: 'a11y:scanning'
}

export type AgentToPanel = AgentReadyMessage | ReportMessage | ScanningMessage

/* ── panel → agent ─────────────────────────────────────────────────────── */

export interface PanelReadyMessage {
  type: 'a11y:panel-ready'
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
export interface RescanMessage {
  type: 'a11y:rescan'
}

export type PanelToAgent
  = | PanelReadyMessage
    | HighlightMessage
    | ClearHighlightMessage
    | RescanMessage

export type A11yMessage = AgentToPanel | PanelToAgent

/** Empty per-impact counter — handy initial value. */
export function emptyCounts(): Record<Impact, number> {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 }
}
