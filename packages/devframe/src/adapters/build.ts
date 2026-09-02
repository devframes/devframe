/* eslint-disable no-console */
import type { DevframeNodeContext } from '../types/context'
import type { DevframeDefinition, DevframeSnapshotRpcEntry } from '../types/devframe'
import type { StaticAssetsSource } from '../types/remote-assets'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import { colors as c } from 'devframe/utils/colors'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { structuredCloneStringify } from 'devframe/utils/structured-clone'
import { dirname, resolve } from 'pathe'
import { resolveClientAssets } from '../client-assets'
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
   * Override the SPA dist to copy into `outDir`: a local directory or a
   * remote-assets declaration (materialized in full at build time). When
   * omitted the adapter reads `devframe.clientAssets` (or the deprecated
   * `devframe.cli?.distDir`); authors typically set this once on the
   * definition itself.
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
   * a definition; this only matters for a caller invoking `createBuild`
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
 *     output is mount-path agnostic, so the same bundle works at `/`,
 *     `/devframe/`, or any base, no rewriting required.
 */
export async function createBuild(d: DevframeDefinition, options: CreateBuildOptions = {}): Promise<void> {
  if (d.capabilities?.build === false && !options.force)
    throw diagnostics.DF0042({ id: d.id })

  const outDir = resolve(options.outDir ?? 'dist-static')
  const distSource = options.distDir ?? resolveClientAssets(d)
  if (!distSource)
    throw new Error(`[devframe] createBuild: no client assets for "${d.id}". Set \`clientAssets\` on the definition or pass it as an option.`)

  if (existsSync(outDir))
    await fs.rm(outDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  const host = createH3DevframeHost({ origin: 'http://localhost', appName: d.id })

  // A static deploy must be self-contained: a local dir (or a remote source
  // backed by a locally installed package) is copied; an uninstalled remote
  // source materializes every listed file from the provider.
  await materializeSpa(resolveStaticAssetsSource(distSource, host.getStorageDir('project'), d.importMetaUrl), outDir)

  const ctx = await createHostContext({
    cwd: process.cwd(),
    mode: 'build',
    host,
    importMetaUrl: d.importMetaUrl,
  })
  // Services ready before setup, so setup can consume them synchronously.
  for (const input of d.services ?? [])
    void ctx.services.install(input, { resolveFrom: d.importMetaUrl })
  await ctx.services.ready()
  await d.setup(ctx)

  // Bake declared `rpc.snapshot` methods (typically a wire service's RPC the
  // devframe doesn't own) into the static dump by attaching a `dump` to their
  // registered definitions, since the service itself defines none.
  applySnapshotRpc(ctx, d.rpc?.snapshot)

  await fs.mkdir(resolve(outDir, DEVFRAME_RPC_DUMP_DIRNAME), { recursive: true })

  await writeConnectionMeta(ctx, outDir)

  console.log(c.cyan`[devframe] writing RPC dump to ${resolve(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME)}`)
  const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)
  await writeDumpFiles(dump, outDir, options.pretty ? 2 : undefined)
  await fs.writeFile(
    resolve(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME),
    JSON.stringify(dump.manifest, null, 2),
    'utf-8',
  )

  console.log(c.green`[devframe] built "${d.id}" -> ${outDir}`)
}

/** Copy a local SPA dist, or materialize a remote assets source, into `outDir`. */
async function materializeSpa(resolved: ReturnType<typeof resolveStaticAssetsSource>, outDir: string): Promise<void> {
  if (typeof resolved === 'string') {
    console.log(c.cyan`[devframe] copying SPA from ${resolved} -> ${outDir}`)
    await fs.cp(resolved, outDir, { recursive: true })
    return
  }
  console.log(c.cyan`[devframe] materializing SPA from ${resolved.assets.package}@${resolved.assets.version} -> ${outDir}`)
  await resolved.materialize(outDir)
}

/** Write `__connection.json` with the JSON-serializable method allow-list. */
async function writeConnectionMeta(ctx: DevframeNodeContext, outDir: string): Promise<void> {
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
}

/** Encode and write each sharded RPC dump file under `outDir`. */
async function writeDumpFiles(
  dump: Awaited<ReturnType<typeof collectStaticRpcDump>>,
  outDir: string,
  indent: number | undefined,
): Promise<void> {
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
}

/**
 * Attach a `dump` to each {@link DevframeRpcOptions.snapshot} target so the
 * static collector bakes it, even though the (service-owned) definition
 * declares no dump of its own. A bare method id becomes `snapshot: true`
 * (bakes the no-arg call); `{ method, inputs }` bakes one record per resolved
 * argument-tuple by running the target's own handler, with the first tuple's
 * output as the fallback.
 */
export function applySnapshotRpc(ctx: DevframeNodeContext, entries: readonly DevframeSnapshotRpcEntry[] | undefined): void {
  for (const entry of entries ?? []) {
    const method = typeof entry === 'string' ? entry : entry.method
    const def = ctx.rpc.definitions.get(method)
    if (!def) {
      diagnostics.DF0072({ method })
      continue
    }
    if (typeof entry === 'string') {
      def.snapshot = true
      continue
    }
    const inputsSpec = entry.inputs
    def.dump = async (dumpCtx: DevframeNodeContext, handler: (...args: any[]) => any) => {
      const tuples = typeof inputsSpec === 'function' ? await inputsSpec(dumpCtx) : inputsSpec
      const records = []
      for (const input of tuples)
        records.push({ inputs: [...input] as any[], output: await handler(...input) })
      return { records, fallback: records[0]?.output }
    }
  }
}
