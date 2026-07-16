/**
 * File data sources for the standalone CLI: `.json` parses whole, `.jsonl` /
 * `.ndjson` parse as an array of records. Each file becomes one static
 * source in the registry.
 */
import type { DataSourceEntry } from '../registry/index'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'
import { diagnostics } from './diagnostics'

export const SUPPORTED_DATA_EXTENSIONS = ['.json', '.jsonl', '.ndjson'] as const

/** Parse a data file into the value a source exposes. */
export async function loadDataFile(filepath: string): Promise<unknown> {
  const ext = extname(filepath).toLowerCase()
  if (!SUPPORTED_DATA_EXTENSIONS.includes(ext as typeof SUPPORTED_DATA_EXTENSIONS[number]))
    throw diagnostics.DP_DATA_INSPECTOR_0002({ filepath })
  let text: string
  try {
    text = await readFile(filepath, 'utf-8')
  }
  catch (error) {
    throw diagnostics.DP_DATA_INSPECTOR_0003({ filepath, message: error instanceof Error ? error.message : String(error) })
  }
  try {
    if (ext === '.json')
      return JSON.parse(text)
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
  }
  catch (error) {
    throw diagnostics.DP_DATA_INSPECTOR_0003({ filepath, message: error instanceof Error ? error.message : String(error) })
  }
}

/** Build a static registry entry for a data file (lazy: reads on first query). */
export function createFileDataSource(filepath: string, cwd = process.cwd()): DataSourceEntry {
  const absolute = resolve(cwd, filepath)
  return {
    id: `file:${filepath}`,
    title: basename(filepath),
    description: absolute,
    icon: 'i-ph:file-duotone',
    static: true,
    data: () => loadDataFile(absolute),
  }
}
