import type { StructuredPatchHunk } from 'diff'
import { parsePatch } from 'diff'

/** A file's change type, mirroring the categories the status mark understands. */
export type DiffChangeType = 'new' | 'deleted' | 'rename-pure' | 'rename-changed' | 'modified'

export interface DiffLineChange {
  type: 'context' | 'add' | 'del'
  /** Line content without the leading +/-/space indicator. */
  content: string
  /** 1-based line number on the old side, or `null` for added lines. */
  oldNumber: number | null
  /** 1-based line number on the new side, or `null` for removed lines. */
  newNumber: number | null
}

interface DiffHunkChange {
  /** The `@@ -a,b +c,d @@` header, with the section/function context git provides. */
  header: string
  lines: DiffLineChange[]
}

export interface DiffFileChange {
  /** Display name - the new path, or the old path for a deletion. */
  name: string
  /** The pre-rename path, when this file was renamed; otherwise `null`. */
  prevName: string | null
  type: DiffChangeType
  binary: boolean
  additions: number
  deletions: number
  hunks: DiffHunkChange[]
  /** Language id (from the file extension) for the highlighter; `undefined` when unknown. */
  lang: string | undefined
}

/** Strip git's `a/` / `b/` path prefixes; map `/dev/null` to `null`. */
function cleanName(name: string | undefined): string | null {
  if (!name || name === '/dev/null')
    return null
  return name.replace(/^[ab]\//, '')
}

/** Infer a Shiki language id from a path's extension (unknown ids degrade server-side). */
function inferLang(name: string | null): string | undefined {
  if (!name)
    return undefined
  const ext = /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase()
  return ext || undefined
}

/**
 * Split a git patch into per-file blocks on `diff --git` boundaries, so each
 * block parses to exactly one file and its `@@` section headings stay aligned
 * with that file's hunks. A patch without any `diff --git` header (e.g. plain
 * `diff -u` output) is treated as a single block.
 */
function splitFileBlocks(patch: string): string[] {
  const starts: number[] = []
  const re = /^diff --git .*$/gm
  for (let m = re.exec(patch); m; m = re.exec(patch))
    starts.push(m.index)
  if (starts.length === 0)
    return patch.trim() ? [patch] : []
  return starts.map((start, i) => patch.slice(start, starts[i + 1] ?? patch.length))
}

interface GitFileHeader {
  oldName: string | null
  newName: string | null
  isRename: boolean
  isCreate: boolean
  isDelete: boolean
  isBinary: boolean
}

/**
 * Read the git-specific metadata from a file block's extended headers - the
 * thin layer `diff`'s hunk parser doesn't surface on its own. `rename`/`copy`
 * and `---`/`+++` lines give clean single paths; the `diff --git` line is the
 * fallback for pure renames and binary changes that carry no `---`/`+++`.
 */
function parseGitHeader(block: string): GitFileHeader {
  const header: GitFileHeader = { oldName: null, newName: null, isRename: false, isCreate: false, isDelete: false, isBinary: false }
  for (const line of block.split('\n')) {
    if (line.startsWith('@@'))
      break
    if (line.startsWith('new file mode')) {
      header.isCreate = true
    }
    else if (line.startsWith('deleted file mode')) {
      header.isDelete = true
    }
    else if (line.startsWith('rename from ') || line.startsWith('copy from ')) {
      header.oldName = line.slice(line.indexOf('from ') + 5)
      header.isRename ||= line.startsWith('rename')
    }
    else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
      header.newName = line.slice(line.indexOf('to ') + 3)
      header.isRename ||= line.startsWith('rename')
    }
    else if (line.startsWith('--- ')) {
      header.oldName = cleanName(line.slice(4))
    }
    else if (line.startsWith('+++ ')) {
      header.newName = cleanName(line.slice(4))
    }
    else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      header.isBinary = true
    }
    else if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
      if (m) {
        header.oldName ??= m[1]
        header.newName ??= m[2]
      }
    }
  }
  return header
}

/** The `@@ ... @@ <section>` headings inside a single file block, in order. */
function sectionHeadings(block: string): string[] {
  return [...block.matchAll(/^@@ .* @@(.*)$/gm)].map(m => m[1].trim())
}

/**
 * A lenient hunk parser used when `diff`'s strict parser rejects a block - the
 * common case being a patch truncated mid-hunk (the server caps patch size), so
 * the final hunk's line count won't match its `@@` header. Reads each `@@`
 * header and consumes the diff lines that follow, ignoring the declared counts.
 */
function parseHunksLenient(block: string): StructuredPatchHunk[] {
  const hunks: StructuredPatchHunk[] = []
  let current: StructuredPatchHunk | null = null
  for (const line of block.split('\n')) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (m) {
      current = { oldStart: +m[1], oldLines: m[2] ? +m[2] : 1, newStart: +m[3], newLines: m[4] ? +m[4] : 1, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current)
      continue
    const marker = line[0]
    if (marker === ' ' || marker === '+' || marker === '-' || marker === '\\')
      current.lines.push(line)
    else
      current = null
  }
  return hunks
}

/** Parse a block's hunks with `diff`, falling back to the lenient parser on failure. */
function parseHunks(block: string): StructuredPatchHunk[] {
  try {
    return parsePatch(block)[0]?.hunks ?? []
  }
  catch {
    return parseHunksLenient(block)
  }
}

/**
 * Parse a unified/git patch into structured per-file diffs. Uses `diff`'s
 * battle-tested hunk parser and layers on the git-specific semantics (rename /
 * create / delete / binary, old and new paths). Tolerant of truncation: a
 * block that `diff` rejects (e.g. a hunk clipped by the server's size cap)
 * falls back to a lenient hunk parse rather than being dropped.
 */
/** Classify a file's change from its git header, tie-breaking renames on hunks. */
function resolveChangeType(meta: GitFileHeader, hasHunks: boolean): DiffChangeType {
  if (meta.isCreate)
    return 'new'
  if (meta.isDelete)
    return 'deleted'
  if (meta.isRename)
    return hasHunks ? 'rename-changed' : 'rename-pure'
  return 'modified'
}

/** Turn one hunk's raw lines into structured line changes, counting +/-. */
function parseHunkLines(hunk: StructuredPatchHunk): { lines: DiffLineChange[], additions: number, deletions: number } {
  let oldNo = hunk.oldStart
  let newNo = hunk.newStart
  let additions = 0
  let deletions = 0
  const lines: DiffLineChange[] = []
  for (const raw of hunk.lines) {
    const marker = raw[0]
    const content = raw.slice(1)
    if (marker === '+') {
      additions++
      lines.push({ type: 'add', content, oldNumber: null, newNumber: newNo++ })
    }
    else if (marker === '-') {
      deletions++
      lines.push({ type: 'del', content, oldNumber: oldNo++, newNumber: null })
    }
    else if (marker === '\\') {
      // "\ No newline at end of file" - a marker, not a content line.
      continue
    }
    else {
      lines.push({ type: 'context', content, oldNumber: oldNo++, newNumber: newNo++ })
    }
  }
  return { lines, additions, deletions }
}

/** Parse one `diff --git` block into a structured file change. */
function parseFileBlock(block: string): DiffFileChange {
  const meta = parseGitHeader(block)
  const rawHunks = parseHunks(block)
  const headings = sectionHeadings(block)
  const type = resolveChangeType(meta, rawHunks.length > 0)

  const name = (type === 'deleted' ? meta.oldName : meta.newName) ?? meta.oldName ?? meta.newName ?? '(unknown)'
  const prevName = meta.isRename && meta.oldName && meta.oldName !== name ? meta.oldName : null

  let additions = 0
  let deletions = 0
  const hunks: DiffHunkChange[] = rawHunks.map((hunk, i) => {
    const parsed = parseHunkLines(hunk)
    additions += parsed.additions
    deletions += parsed.deletions
    const range = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    const section = headings[i]
    return { header: section ? `${range} ${section}` : range, lines: parsed.lines }
  })

  return { name, prevName, type, binary: meta.isBinary, additions, deletions, hunks, lang: inferLang(name) }
}

export function parseUnifiedPatch(patch: string): DiffFileChange[] {
  return splitFileBlocks(patch).map(parseFileBlock)
}
