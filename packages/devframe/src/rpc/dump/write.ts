import type { StaticRpcDumpCollection } from './static'
import fs from 'node:fs/promises'
import { DEVFRAME_RPC_DUMP_DIRNAME, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME } from 'devframe/constants'
import { structuredCloneStringify } from 'devframe/utils/structured-clone'
import { dirname, resolve } from 'pathe'
import { strictJsonStringify } from '../serialization'

export interface WriteStaticRpcDumpOptions {
  /**
   * Pretty-print RPC dump JSON files. Defaults to `false` so payload
   * shards (which can be multiple MB for graph-heavy tools) ship
   * minified. Set `true` when you need to diff / read the dumps by hand.
   */
  pretty?: boolean
}

/**
 * Write a collected static RPC dump to disk: every sharded record file plus
 * the `__rpc-dump/index.json` manifest, under `outDir`. Shared by the build
 * adapter (`createBuild`) and `@devframes/hub`'s `buildHub`.
 */
export async function writeStaticRpcDump(
  dump: StaticRpcDumpCollection,
  outDir: string,
  options: WriteStaticRpcDumpOptions = {},
): Promise<void> {
  const indent = options.pretty ? 2 : undefined
  await fs.mkdir(resolve(outDir, DEVFRAME_RPC_DUMP_DIRNAME), { recursive: true })
  for (const [filepath, file] of Object.entries(dump.files)) {
    const fullpath = resolve(outDir, filepath)
    await fs.mkdir(dirname(fullpath), { recursive: true })
    const text = file.serialization === 'structured-clone'
      ? structuredCloneStringify(file.data)
      : strictJsonStringify(file.data, file.fnName)
    await fs.writeFile(
      fullpath,
      // structured-clone-es output is single-line; only JSON honors `indent`.
      file.serialization === 'json' && indent != null
        ? JSON.stringify(JSON.parse(text), null, indent)
        : text,
      'utf-8',
    )
  }
  await fs.writeFile(
    resolve(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME),
    JSON.stringify(dump.manifest, null, 2),
    'utf-8',
  )
}
