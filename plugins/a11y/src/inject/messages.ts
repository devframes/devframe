/**
 * Mirrors scan results into the hub's messages feed when the agent is booted
 * as a dock **client script** (`createDevframeClientHost()` calls the agent's
 * default export with its `DockClientScriptContext`).
 *
 * The hub context is consumed by duck-typing a minimal structural slice, so
 * the agent keeps no build- or runtime dependency on `@devframes/hub` and the
 * bundle stays self-contained — a standalone `<script type="module">` boot
 * simply has no messages client and skips the feed. Mirrors the pattern used
 * by the terminals and code-server plugins for `ctx.terminals`.
 */
import type { Impact, ScanReport } from '../shared/protocol.ts'

/** Structural slice of the hub's `DevframeMessageEntryInput` the agent emits. */
export interface HubMessageInput {
  id?: string
  message: string
  description?: string
  level: 'info' | 'warn' | 'error' | 'success' | 'debug'
  labels?: string[]
  elementPosition?: {
    selector?: string
    boundingBox?: { x: number, y: number, width: number, height: number }
    description?: string
  }
  status?: 'loading' | 'idle'
}

/** Structural slice of the hub's `DevframeMessagesClient` the agent calls. */
export interface HubMessagesClient {
  add: (input: HubMessageInput) => Promise<unknown>
  remove: (id: string) => Promise<void>
}

/**
 * Structural slice of the hub's `DockClientScriptContext` the agent accepts.
 * Every field is optional so any argument — or none — boots the agent.
 */
export interface A11yAgentContext {
  messages?: HubMessagesClient
}

/** One deduplicated summary entry tracks the scan lifecycle. */
const SCAN_MESSAGE_ID = 'devframe-a11y-inspector:scan'
/** One deduplicated entry per violated rule; removed when the rule clears. */
const RULE_MESSAGE_PREFIX = 'devframe-a11y-inspector:rule:'

const IMPACT_LEVEL: Record<Impact, HubMessageInput['level']> = {
  critical: 'error',
  serious: 'error',
  moderate: 'warn',
  minor: 'info',
}

export interface MessagesReporter {
  /** A scan started — surface the deduplicated summary entry as loading. */
  scanning: () => void
  /** A scan finished — update the summary and the per-rule entries. */
  report: (report: ScanReport) => void
  /** A scan failed — settle the summary entry as an error. */
  failed: (error: unknown) => void
}

export interface MessagesReporterOptions {
  /**
   * Resolve the current bounding box of a violating element from its axe
   * target selectors — the agent supplies a live-DOM implementation. A stale
   * box is fine: each re-scan refreshes the entry.
   */
  resolveBoundingBox?: (target: string[]) => { x: number, y: number, width: number, height: number } | undefined
}

/**
 * Build the reporter that projects each {@link ScanReport} onto the messages
 * feed: a summary entry driven through the loading → idle lifecycle, plus one
 * entry per violated rule (stable ids, so re-scans update in place) carrying
 * the impact-mapped level, WCAG tags as labels, and the first offending
 * element's selector and bounding box. Rules that no longer violate are
 * removed.
 */
export function createMessagesReporter(
  messages: HubMessagesClient,
  options: MessagesReporterOptions = {},
): MessagesReporter {
  let reportedRules = new Set<string>()
  // Fire-and-forget: the feed is a mirror, never a gate for the scan loop.
  const send = (input: HubMessageInput) => void messages.add(input).catch(() => {})
  const drop = (id: string) => void messages.remove(id).catch(() => {})

  return {
    scanning() {
      send({
        id: SCAN_MESSAGE_ID,
        message: 'Scanning page for accessibility issues…',
        level: 'info',
        status: 'loading',
      })
    },

    report(report) {
      const nodeCount = report.violations.reduce((n, v) => n + v.nodes.length, 0)
      const ruleCount = report.violations.length
      send({
        id: SCAN_MESSAGE_ID,
        message: nodeCount === 0
          ? 'No accessibility issues found'
          : `${nodeCount} accessibility issue${nodeCount === 1 ? '' : 's'} across ${ruleCount} rule${ruleCount === 1 ? '' : 's'}`,
        description: report.url,
        level: nodeCount === 0 ? 'success' : 'warn',
        status: 'idle',
      })

      const seen = new Set<string>()
      for (const violation of report.violations) {
        seen.add(violation.ruleId)
        const first = violation.nodes[0]
        send({
          id: RULE_MESSAGE_PREFIX + violation.ruleId,
          message: `${violation.help} (${violation.nodes.length})`,
          description: `${violation.description}\n${violation.helpUrl}`,
          level: IMPACT_LEVEL[violation.impact],
          labels: [violation.impact, ...(violation.tags ?? [])],
          elementPosition: first
            ? {
                selector: first.target.join(' '),
                boundingBox: options.resolveBoundingBox?.(first.target),
                description: first.failureSummary,
              }
            : undefined,
        })
      }
      for (const ruleId of reportedRules) {
        if (!seen.has(ruleId))
          drop(RULE_MESSAGE_PREFIX + ruleId)
      }
      reportedRules = seen
    },

    failed(error) {
      send({
        id: SCAN_MESSAGE_ID,
        message: 'Accessibility scan failed',
        description: String(error),
        level: 'error',
        status: 'idle',
      })
    },
  }
}
