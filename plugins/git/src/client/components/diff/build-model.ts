import type { DiffFileChange, DiffLineChange } from './parse-patch'
import { diffWords } from 'diff'

/** A contiguous, changed character range `[start, end)` within a line's content. */
export type WordRange = [number, number]

export interface RenderLine extends DiffLineChange {
  /** Which reconstructed side holds this line's syntax tokens. */
  tokenSide: 'old' | 'new'
  /** Index into that side's tokenized lines. */
  tokenLine: number
  /** Changed word ranges within `content`, for intra-line emphasis. */
  wordRanges: WordRange[]
}

export interface RenderHunk {
  header: string
  lines: RenderLine[]
}

export interface DiffFileModel {
  file: DiffFileChange
  /** Reconstructed old-side source (context + removed lines), for tokenizing. */
  oldText: string
  /** Reconstructed new-side source (context + added lines), for tokenizing. */
  newText: string
  hunks: RenderHunk[]
}

/** Changed char ranges on each side of a modified line pair, via word-level diff. */
function wordDiffRanges(oldStr: string, newStr: string): { old: WordRange[], new: WordRange[] } {
  const oldRanges: WordRange[] = []
  const newRanges: WordRange[] = []
  let oldOffset = 0
  let newOffset = 0
  for (const change of diffWords(oldStr, newStr)) {
    const len = change.value.length
    if (change.added) {
      newRanges.push([newOffset, newOffset + len])
      newOffset += len
    }
    else if (change.removed) {
      oldRanges.push([oldOffset, oldOffset + len])
      oldOffset += len
    }
    else {
      oldOffset += len
      newOffset += len
    }
  }
  return { old: oldRanges, new: newRanges }
}

/**
 * Pair the removed and added lines of each contiguous change block within a
 * hunk (first removed with first added, and so on) and compute their word-level
 * ranges. Returns a map from the line's index in `lines` to its changed ranges.
 */
interface ChangeBlock {
  delStart: number
  addStart: number
  addEnd: number
}

/** Scan the contiguous del-run then add-run starting at `delStart`. */
function scanChangeBlock(lines: DiffLineChange[], delStart: number): ChangeBlock {
  let i = delStart
  while (i < lines.length && lines[i].type === 'del') i++
  const addStart = i
  while (i < lines.length && lines[i].type === 'add') i++
  return { delStart, addStart, addEnd: i }
}

/** Pair removed with added lines in a block and record their word ranges. */
function pairBlockRanges(lines: DiffLineChange[], block: ChangeBlock, ranges: Map<number, WordRange[]>): void {
  const pairs = Math.min(block.addStart - block.delStart, block.addEnd - block.addStart)
  for (let k = 0; k < pairs; k++) {
    const delLine = lines[block.delStart + k]
    const addLine = lines[block.addStart + k]
    const { old, new: next } = wordDiffRanges(delLine.content, addLine.content)
    if (old.length > 0)
      ranges.set(block.delStart + k, old)
    if (next.length > 0)
      ranges.set(block.addStart + k, next)
  }
}

function computeWordRanges(lines: DiffLineChange[]): Map<number, WordRange[]> {
  const ranges = new Map<number, WordRange[]>()
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'del') {
      i++
      continue
    }
    const block = scanChangeBlock(lines, i)
    pairBlockRanges(lines, block, ranges)
    i = block.addEnd
  }
  return ranges
}

/**
 * Turn a parsed file diff into a render model: the reconstructed old/new side
 * source strings to feed the highlighter, plus per-line token coordinates and
 * intra-line word ranges. Context lines join both sides (so each side tokenizes
 * as coherent source), and are highlighted from the new side.
 */
export function buildFileModel(file: DiffFileChange): DiffFileModel {
  const oldLines: string[] = []
  const newLines: string[] = []

  const hunks: RenderHunk[] = file.hunks.map((hunk) => {
    const wordRanges = computeWordRanges(hunk.lines)
    const lines: RenderLine[] = hunk.lines.map((line, idx) => {
      let tokenSide: 'old' | 'new'
      let tokenLine: number
      if (line.type === 'del') {
        tokenSide = 'old'
        tokenLine = oldLines.length
        oldLines.push(line.content)
      }
      else if (line.type === 'add') {
        tokenSide = 'new'
        tokenLine = newLines.length
        newLines.push(line.content)
      }
      else {
        // Context lines belong to both reconstructed sides; highlight from the new one.
        oldLines.push(line.content)
        tokenSide = 'new'
        tokenLine = newLines.length
        newLines.push(line.content)
      }
      return { ...line, tokenSide, tokenLine, wordRanges: wordRanges.get(idx) ?? [] }
    })
    return { header: hunk.header, lines }
  })

  return { file, oldText: oldLines.join('\n'), newText: newLines.join('\n'), hunks }
}
