import { describe, expect, it } from 'vitest'
import { buildFileModel } from './build-model'
import { parseUnifiedPatch } from './parse-patch'

const MODIFIED = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 a
-hello world
+hello there
 c
`

describe('buildFileModel', () => {
  it('reconstructs coherent old and new side sources', () => {
    const [file] = parseUnifiedPatch(MODIFIED)
    const model = buildFileModel(file)
    expect(model.oldText).toBe('a\nhello world\nc')
    expect(model.newText).toBe('a\nhello there\nc')
  })

  it('maps context lines to the new side and changed lines to their own side', () => {
    const [file] = parseUnifiedPatch(MODIFIED)
    const { lines } = buildFileModel(file).hunks[0]
    expect(lines[0]).toMatchObject({ type: 'context', tokenSide: 'new', tokenLine: 0 })
    expect(lines[1]).toMatchObject({ type: 'del', tokenSide: 'old', tokenLine: 1 })
    expect(lines[2]).toMatchObject({ type: 'add', tokenSide: 'new', tokenLine: 1 })
    expect(lines[3]).toMatchObject({ type: 'context', tokenSide: 'new', tokenLine: 2 })
  })

  it('computes intra-line word ranges for a paired del/add', () => {
    const [file] = parseUnifiedPatch(MODIFIED)
    const { lines } = buildFileModel(file).hunks[0]
    // "hello world" -> "hello there": only the second word changed.
    expect(lines[1].wordRanges).toEqual([[6, 11]])
    expect(lines[2].wordRanges).toEqual([[6, 11]])
    // Context lines carry no intra-line emphasis.
    expect(lines[0].wordRanges).toEqual([])
  })
})
