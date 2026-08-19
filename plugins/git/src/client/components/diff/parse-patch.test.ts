import { describe, expect, it } from 'vitest'
import { parseUnifiedPatch } from './parse-patch'

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ function foo() {
 a
-b
+B
 c
`

const NEW_FILE = `diff --git a/new.md b/new.md
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.md
@@ -0,0 +1,2 @@
+hello
+world
`

const DELETED = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 1111111..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-now
`

const RENAME_PURE = `diff --git a/old/name.ts b/new/name.ts
similarity index 100%
rename from old/name.ts
rename to new/name.ts
`

const RENAME_CHANGED = `diff --git a/old.ts b/new.ts
similarity index 80%
rename from old.ts
rename to new.ts
index 1111111..2222222 100644
--- a/old.ts
+++ b/new.ts
@@ -1,2 +1,2 @@
 keep
-x
+y
`

const BINARY = `diff --git a/img.png b/img.png
index 1111111..2222222 100644
Binary files a/img.png and b/img.png differ
`

const MULTI_HUNK = `diff --git a/m.ts b/m.ts
index 1111111..2222222 100644
--- a/m.ts
+++ b/m.ts
@@ -1,2 +1,2 @@
 a
-b
+B
@@ -10,2 +10,3 @@
 x
+y
 z
`

const NO_NEWLINE = `diff --git a/n.txt b/n.txt
index 1111111..2222222 100644
--- a/n.txt
+++ b/n.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`

// Hunk header claims 50 lines but only 3 follow (server truncated the patch).
const TRUNCATED = `diff --git a/t.ts b/t.ts
index 1111111..2222222 100644
--- a/t.ts
+++ b/t.ts
@@ -1,50 +1,50 @@
 a
-b
+B`

describe('parseUnifiedPatch', () => {
  it('parses a modified file with counts, line numbers, and section heading', () => {
    const [file] = parseUnifiedPatch(MODIFIED)
    expect(file).toMatchObject({ name: 'src/a.ts', prevName: null, type: 'modified', binary: false, additions: 1, deletions: 1, lang: 'ts' })
    expect(file.hunks).toHaveLength(1)
    expect(file.hunks[0].header).toBe('@@ -1,3 +1,3 @@ function foo() {')
    expect(file.hunks[0].lines).toEqual([
      { type: 'context', content: 'a', oldNumber: 1, newNumber: 1 },
      { type: 'del', content: 'b', oldNumber: 2, newNumber: null },
      { type: 'add', content: 'B', oldNumber: null, newNumber: 2 },
      { type: 'context', content: 'c', oldNumber: 3, newNumber: 3 },
    ])
  })

  it('classifies a new file', () => {
    const [file] = parseUnifiedPatch(NEW_FILE)
    expect(file).toMatchObject({ name: 'new.md', type: 'new', additions: 2, deletions: 0, lang: 'md' })
  })

  it('classifies a deleted file (named by its old path)', () => {
    const [file] = parseUnifiedPatch(DELETED)
    expect(file).toMatchObject({ name: 'gone.txt', type: 'deleted', additions: 0, deletions: 2 })
  })

  it('classifies a pure rename (no hunks) with prevName', () => {
    const [file] = parseUnifiedPatch(RENAME_PURE)
    expect(file).toMatchObject({ name: 'new/name.ts', prevName: 'old/name.ts', type: 'rename-pure' })
    expect(file.hunks).toHaveLength(0)
  })

  it('classifies a rename with content changes', () => {
    const [file] = parseUnifiedPatch(RENAME_CHANGED)
    expect(file).toMatchObject({ name: 'new.ts', prevName: 'old.ts', type: 'rename-changed', additions: 1, deletions: 1 })
  })

  it('flags a binary change with no hunks', () => {
    const [file] = parseUnifiedPatch(BINARY)
    expect(file).toMatchObject({ name: 'img.png', type: 'modified', binary: true })
    expect(file.hunks).toHaveLength(0)
  })

  it('parses multiple hunks with independent line numbering', () => {
    const [file] = parseUnifiedPatch(MULTI_HUNK)
    expect(file.hunks).toHaveLength(2)
    expect(file.hunks[1].lines).toEqual([
      { type: 'context', content: 'x', oldNumber: 10, newNumber: 10 },
      { type: 'add', content: 'y', oldNumber: null, newNumber: 11 },
      { type: 'context', content: 'z', oldNumber: 11, newNumber: 12 },
    ])
  })

  it('drops "no newline at end of file" markers', () => {
    const [file] = parseUnifiedPatch(NO_NEWLINE)
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
    expect(file.hunks[0].lines.map(l => l.type)).toEqual(['del', 'add'])
  })

  it('salvages a truncated hunk instead of dropping the file', () => {
    const [file] = parseUnifiedPatch(TRUNCATED)
    expect(file).toMatchObject({ name: 't.ts', additions: 1, deletions: 1 })
    expect(file.hunks[0].lines).toHaveLength(3)
  })

  it('parses every file in a multi-file patch', () => {
    const files = parseUnifiedPatch(MODIFIED + NEW_FILE + BINARY)
    expect(files.map(f => f.name)).toEqual(['src/a.ts', 'new.md', 'img.png'])
  })

  it('returns nothing for an empty patch', () => {
    expect(parseUnifiedPatch('')).toEqual([])
  })
})
