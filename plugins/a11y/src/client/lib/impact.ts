import type { Impact } from '../../shared/protocol.ts'

/**
 * Severity palette — the only expressive color in the panel. Mirrors the
 *  ring colors the injected agent draws, so a row and its in-page highlight
 *  read as the same object.
 */
export const IMPACT_COLOR: Record<Impact, string> = {
  critical: '#ff5c7a',
  serious: '#ff9b52',
  moderate: '#f2d14e',
  minor: '#6fb1fc',
}

export const IMPACT_LABEL: Record<Impact, string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
}
