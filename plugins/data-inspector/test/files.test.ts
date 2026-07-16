import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFileDataSource, loadDataFile } from '../src/node/files'

function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'di-files-'))
  const filepath = join(dir, name)
  writeFileSync(filepath, content)
  return filepath
}

describe('file data sources', () => {
  it('parses .json whole', async () => {
    const file = tempFile('stats.json', '{ "a": [1, 2] }')
    expect(await loadDataFile(file)).toEqual({ a: [1, 2] })
  })

  it('parses .jsonl as an array of records', async () => {
    const file = tempFile('trace.jsonl', '{"n":1}\n\n{"n":2}\n')
    expect(await loadDataFile(file)).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('rejects unsupported extensions with a coded diagnostic', async () => {
    const file = tempFile('data.yaml', 'a: 1')
    await expect(loadDataFile(file)).rejects.toThrow(/Unsupported data file/)
  })

  it('reports parse failures with the filepath', async () => {
    const file = tempFile('broken.json', '{ nope')
    await expect(loadDataFile(file)).rejects.toThrow(/Failed to load data file/)
  })

  it('builds a static, lazily-read registry entry', async () => {
    const file = tempFile('stats.json', '{ "ok": true }')
    const entry = createFileDataSource(file)
    expect(entry).toMatchObject({ id: `file:${file}`, static: true })
    expect(await (entry.data as () => Promise<unknown>)()).toEqual({ ok: true })
  })
})
