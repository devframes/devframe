import type { WordRange } from './build-model'
import type { Token } from './use-diff-tokens'

export interface DiffSegment {
  text: string
  /** Shiki dual-theme inline style (`{ color, '--shiki-dark' }`), if highlighted. */
  style: Record<string, string> | undefined
  /** True when this segment falls inside a changed word range (intra-line emphasis). */
  changed: boolean
}

interface Span { start: number, end: number, style?: Record<string, string> }

/**
 * Slice a line's syntax tokens and its changed word ranges into a flat list of
 * render segments. Each segment carries the token color (as a Shiki dual-theme
 * inline style) and whether it sits inside a changed word, so the renderer can
 * paint syntax color and intra-line emphasis in one pass. Falls back to a single
 * plain span when tokens are absent or don't line up with the content length.
 */
export function buildSegments(tokens: Token[] | null | undefined, content: string, wordRanges: WordRange[]): DiffSegment[] {
  const spans: Span[] = []
  let total = 0
  if (tokens) {
    for (const token of tokens) {
      spans.push({ start: total, end: total + token.content.length, style: token.htmlStyle })
      total += token.content.length
    }
  }
  // Without tokens, or if they don't cover the content exactly (stale/mismatched
  // line), treat the whole line as one unstyled span.
  if (!tokens || total !== content.length) {
    spans.length = 0
    spans.push({ start: 0, end: content.length })
  }

  const bounds = new Set<number>([0, content.length])
  for (const span of spans) {
    bounds.add(span.start)
    bounds.add(span.end)
  }
  for (const [start, end] of wordRanges) {
    bounds.add(start)
    bounds.add(end)
  }
  const ordered = [...bounds].filter(n => n >= 0 && n <= content.length).sort((a, b) => a - b)

  const segments: DiffSegment[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]
    const b = ordered[i + 1]
    if (a === b)
      continue
    const style = spans.find(span => span.start <= a && span.end > a)?.style
    const changed = wordRanges.some(([start, end]) => a >= start && a < end)
    segments.push({ text: content.slice(a, b), style, changed })
  }
  if (segments.length === 0)
    segments.push({ text: '', style: undefined, changed: false })
  return segments
}
