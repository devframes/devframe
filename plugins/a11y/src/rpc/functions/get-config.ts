import { defineRpcFunction } from 'devframe'
import { A11Y_CHANNEL, A11Y_NODE_ATTR, IMPACT_ORDER } from '../../shared/protocol.ts'

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

/**
 * Static metadata the panel reads once on load: the impact taxonomy (with
 * developer-facing copy) and the channel coordinates the panel uses to find
 * its injected agent.
 *
 * Declared `static`, so the value is resolved live over WebSocket in dev and
 * baked into the RPC dump for static builds — the panel's legend renders the
 * same in both modes.
 */
export const getConfig = defineRpcFunction({
  name: 'devframe-a11y-inspector:get-config',
  type: 'static',
  jsonSerializable: true,
  handler: () => ({
    channel: A11Y_CHANNEL,
    nodeAttr: A11Y_NODE_ATTR,
    docsBase: 'https://dequeuniversity.com/rules/axe/',
    impacts: IMPACT_ORDER.map(id => ({ id, ...IMPACT_COPY[id] })),
  }),
})
