/* eslint-disable no-console */
import type { DevframeDefinition } from '../types/devframe'
import type { StaticAssetsSource } from '../types/remote-assets'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import { colors as c } from 'devframe/utils/colors'
import { createRemoteAssetsStore, remoteAssetsCacheDir, remoteAssetsCacheRoot, resolveInstalledRemoteAssets } from 'devframe/utils/remote-assets'
import { structuredCloneStringify } from 'devframe/utils/structured-clone'
import { dirname, resolve } from 'pathe'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_RPC_DUMP_DIRNAME,
  DEVFRAME_RPC_DUMP_MANIFEST_FILENAME,
} from '../constants'
import { createHostContext } from '../node/context'
import { diagnostics } from '../node/diagnostics'
import { createH3DevframeHost } from '../node/host-h3'
import { collectStaticRpcDump } from '../rpc/dump/static'
import { strictJsonStringify } from '../rpc/serialization'

export interface CreateBuildOptions {
  /** Output directory. Defaults to `dist-static`. */
  outDir?: string
  /**
   * Override the SPA dist to copy into `outDir` — a local directory or a
   * remote-assets declaration (materialized in full at build time). When
   * omitted the adapter reads `devframe.cli?.distDir` — authors typically
   * set this once on the definition itself.
   */
  distDir?: StaticAssetsSource
  /**
   * Pretty-print RPC dump JSON files. Defaults to `false` so payload
   * shards (which can be multiple MB for graph-heavy tools) ship
   * minified. Set `true` when you need to diff / read the dumps by hand.
   */
  pretty?: boolean
  /**
   * Proceed even when the definition declares `capabilities.build: false`.
   * `createCac` already skips registering the `build` subcommand for such
   * a definition — this only matters for a caller invoking `createBuild`
   * directly, bypassing the CLI.
   */
  force?: boolean
}

/**
 * Produce a self-contained static deploy of a devframe:
 *
 *   - Build a `mode: 'build'` context and run `devframe.setup(ctx)`.
 *   - Copy the author's SPA dist into `<outDir>/`.
 *   - Write `<outDir>/__connection.json` (`{ backend: 'static' }`) and the
 *     sharded RPC dump under `<outDir>/__rpc-dump/` so the deployed SPA
 *     discovers both via relative paths from `document.baseURI`. The
 *     output is mount-path agnostic — the same bundle works at `/`,
 *     `/devframe/`, or any base, no rewriting required.
 */
export async function createBuild(d: DevframeDefinition, options: CreateBuildOptions = {}): Promise<void> {
  if (d.capabilities?.build === false && !options.force)
    throw diagnostics.DF0042({ id: d.id })

  const outDir = resolve(options.outDir ?? 'dist-static')
  const distSource = options.distDir ?? d.cli?.distDir
  if (!distSource)
    throw new Error(`[devframe] createBuild: no distDir for "${d.id}". Set \`cli.distDir\` on the definition or pass it as an option.`)

  if (existsSync(outDir))
    await fs.rm(outDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  const host = createH3DevframeHost({ origin: 'http://localhost', appName: d.id })

  // Copy author's SPA into the output root. A remote-assets source copies
  // from the locally installed assets package when present, otherwise every
  // listed file is materialized from the provider — a static deploy must be
  // self-contained.
  if (typeof distSource === 'string') {
    console.log(c.cyan`[devframe] copying SPA from ${distSource} -> ${outDir}`)
    await fs.cp(distSource, outDir, { recursive: true })
  }
  else {
    const installed = resolveInstalledRemoteAssets(distSource)
    if (installed) {
      console.log(c.cyan`[devframe] copying SPA from ${installed} -> ${outDir}`)
      await fs.cp(installed, outDir, { recursive: true })
    }
    else {
      console.log(c.cyan`[devframe] materializing SPA from ${distSource.package}@${distSource.version} -> ${outDir}`)
      const cacheRoot = remoteAssetsCacheRoot(host.getStorageDir('project'))
      const store = createRemoteAssetsStore(distSource, {
        cacheDir: remoteAssetsCacheDir(cacheRoot, distSource),
      })
      await store.materialize(outDir)
    }
  }

  const ctx = await createHostContext({
    cwd: process.cwd(),
    mode: 'build',
    host,
  })
  await d.setup(ctx)

  await fs.mkdir(resolve(outDir, DEVFRAME_RPC_DUMP_DIRNAME), { recursive: true })

  const jsonSerializableMethods: string[] = []
  for (const def of ctx.rpc.definitions.values()) {
    if (def.jsonSerializable === true)
      jsonSerializableMethods.push(def.name)
  }
  await fs.writeFile(
    resolve(outDir, DEVFRAME_CONNECTION_META_FILENAME),
    JSON.stringify({ backend: 'static', jsonSerializableMethods }, null, 2),
    'utf-8',
  )

  console.log(c.cyan`[devframe] writing RPC dump to ${resolve(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME)}`)
  const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)
  const indent = options.pretty ? 2 : undefined
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

  console.log(c.green`[devframe] built "${d.id}" -> ${outDir}`)
}
