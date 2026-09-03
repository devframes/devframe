import type { Impact } from '../../shared/protocol.ts'

// The severity palette is shared with the page script, a single source in the
// protocol module so the panel and the highlight ring never drift.
export { IMPACT_COLOR } from '../../shared/protocol.ts'

export const IMPACT_LABEL: Record<Impact, string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
}
