import type {
  DevframeNodeContext,
  DevframeServiceDefinition,
  DevframeServiceDescriptor,
  DevframeServiceId,
  DevframeServiceInput,
  DevframeServiceOf,
  DevframeServicesHost,
  DevframeServicesState,
} from 'devframe/types'
import process from 'node:process'
import { DEVFRAME_SERVICES_STATE_KEY } from 'devframe/constants'
import { createDebug } from 'obug'
import { diagnostics } from './diagnostics'
import { deepMergeOptionSets, expandResolveFrom, importServicePackage, satisfiesVersionRange } from './services-install'

const debug = createDebug('devframe:services')

/**
 * Per-RPC-host registry of the services already installed against it, keyed
 * by the RPC host object. A single wire service can be declared from more
 * than one devframe context that shares one RPC host (e.g. a kit that mounts
 * a definition alongside another context, so both iterate `def.services`).
 * The per-instance `installed` guard can't see across those sibling hosts, so
 * the second context would re-run the service factory and re-register its RPC,
 * hitting DF0021. Sharing the registry by RPC host makes the first install win
 * across every context on that host.
 */
const installedByRpcHost = new WeakMap<object, Map<string, unknown>>()

interface PendingServiceEntry {
  input: DevframeServiceInput
  resolveFrom?: string | null
  resolve: (api: unknown) => void
  reject: (error: unknown) => void
}

function isServiceDefinition(input: DevframeServiceInput): input is DevframeServiceDefinition {
  return typeof (input as DevframeServiceDefinition).setup === 'function'
}

function validateServiceInput(input: DevframeServiceInput): void {
  if (!input || typeof input.package !== 'string' || input.package.length === 0)
    throw diagnostics.DF0070({ package: String((input as any)?.package ?? input), reason: 'the input has no `package` name' })
  if (isServiceDefinition(input))
    validateServiceDefinition(input)
}

function validateServiceDefinition(def: DevframeServiceDefinition): void {
  if (typeof def.version !== 'string' || def.version.length === 0)
    throw diagnostics.DF0070({ package: def.package, reason: 'the definition has no `version`' })
  if (typeof def.scope !== 'string' || def.scope.length === 0)
    throw diagnostics.DF0070({ package: def.package, reason: 'the definition has no RPC `scope` namespace' })
}

/**
 * Merge every installer's option set in declaration order (the default
 * deep-merge unions arrays and lets later scalars win; a service may override
 * with its own `mergeOptions`).
 */
function mergeInstallerOptions(def: DevframeServiceDefinition, entries: PendingServiceEntry[]): unknown {
  const sets = entries
    .map(entry => entry.input.options)
    .filter(options => options !== undefined)
  if (def.mergeOptions)
    return def.mergeOptions(sets)
  return sets.length > 0 ? deepMergeOptionSets(sets) : undefined
}

/**
 * Cross-plugin service registry (see `types/services.ts` for the contract).
 * Values are held per context instance; `whenAvailable` subscriptions make
 * the mechanism work regardless of setup ordering between provider and
 * consumer.
 *
 * On top of the in-process `provide`/`get` tier, this host implements the
 * **wire-service** lifecycle: `install()` queues definitions/descriptors,
 * `ready()` fires the collect-then-setup barrier: importing descriptor
 * packages, merging option sets per service, constructing each service once,
 * providing its node API under the package name, and advertising it to
 * clients through the `devframe:services` shared state.
 */
export class DevframeServicesHostImpl implements DevframeServicesHost {
  private services = new Map<string, unknown>()
  private listeners = new Map<string, Set<(service: unknown) => void>>()
  private pending = new Map<string, PendingServiceEntry[]>()
  private localInstalled = new Map<string, unknown>()
  private readyPromise: Promise<void> | undefined

  constructor(private context?: DevframeNodeContext) {}

  /**
   * The install-dedup registry, shared across every services host that shares
   * this host's RPC host so the first install of a package wins across sibling
   * contexts. Falls back to a per-instance map when there is no RPC host (a
   * context-less host only exercises the in-process `provide`/`get` tier).
   */
  private get installed(): Map<string, unknown> {
    const rpc = this.context?.rpc as object | undefined
    if (!rpc)
      return this.localInstalled
    let registry = installedByRpcHost.get(rpc)
    if (!registry) {
      registry = new Map()
      installedByRpcHost.set(rpc, registry)
    }
    return registry
  }

  provide<ID extends DevframeServiceId>(id: ID, service: DevframeServiceOf<ID>): () => void {
    const key = id as string
    if (this.services.has(key))
      throw diagnostics.DF0037({ id: key })
    this.services.set(key, service)
    for (const listener of this.listeners.get(key) ?? [])
      listener(service)
    return () => {
      if (this.services.get(key) === service)
        this.services.delete(key)
    }
  }

  get<ID extends DevframeServiceId>(id: ID): DevframeServiceOf<ID> | undefined {
    return this.services.get(id as string) as DevframeServiceOf<ID> | undefined
  }

  has(id: DevframeServiceId): boolean {
    return this.services.has(id as string)
  }

  whenAvailable<ID extends DevframeServiceId>(
    id: ID,
    callback: (service: DevframeServiceOf<ID>) => void,
  ): () => void {
    const key = id as string
    if (this.services.has(key))
      callback(this.services.get(key) as DevframeServiceOf<ID>)
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    const listener = callback as (service: unknown) => void
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  keys(): string[] {
    return Array.from(this.services.keys())
  }

  install<API = unknown, Options = any>(
    input: DevframeServiceInput<API, Options>,
    options?: { resolveFrom?: string | null },
  ): Promise<API | undefined> {
    validateServiceInput(input as DevframeServiceInput)
    const promise = new Promise<unknown>((resolve, reject) => {
      const entry: PendingServiceEntry = {
        input: input as DevframeServiceInput,
        resolveFrom: options?.resolveFrom,
        resolve,
        reject,
      }
      if (this.readyPromise) {
        // Post-barrier: construct immediately (merged with nothing but its
        // own option set).
        void this.flushPackage(input.package, [entry]).catch(() => {})
      }
      else {
        let entries = this.pending.get(input.package)
        if (!entries) {
          entries = []
          this.pending.set(input.package, entries)
        }
        entries.push(entry)
      }
    })
    // Mark a rejection as handled on this branch so a fire-and-forget
    // `install()` never crashes the process; awaiting callers (and the
    // adapter's awaited `ready()`) still observe it.
    promise.catch(() => {})
    return promise as Promise<API | undefined>
  }

  ready(): Promise<void> {
    if (this.readyPromise)
      return this.readyPromise
    this.readyPromise = this.flushAll()
    return this.readyPromise
  }

  private async flushAll(): Promise<void> {
    // Materialize the advertisement state even when no service installs, so
    // build-mode dumps always carry the key and static clients read `{}`
    // instead of erroring on a missing snapshot.
    if (this.context)
      await this.advertisementState()
    const groups = Array.from(this.pending.entries())
    this.pending.clear()
    for (const [pkg, entries] of groups)
      await this.flushPackage(pkg, entries)
  }

  private async flushPackage(pkg: string, entries: PendingServiceEntry[]): Promise<unknown> {
    try {
      const api = await this.installPackage(pkg, entries)
      for (const entry of entries)
        entry.resolve(api)
      return api
    }
    catch (error) {
      for (const entry of entries)
        entry.reject(error)
      throw error
    }
  }

  private async installPackage(pkg: string, entries: PendingServiceEntry[]): Promise<unknown> {
    // Dedup: first installation wins; a later install's options are ignored.
    if (this.installed.has(pkg)) {
      const api = this.installed.get(pkg)
      // A sibling context sharing this RPC host already constructed the
      // service. Expose the cached API here too, but skip re-running the
      // factory (which would re-register its RPC and hit DF0021). Only a
      // re-install on the same host (it already provides it) is the noisy
      // duplicate DF0066 warns about.
      if (this.services.has(pkg))
        diagnostics.DF0066({ package: pkg })
      else
        this.provide(pkg, api as DevframeServiceOf<string>)
      return api
    }

    const definitions = entries.filter(entry => isServiceDefinition(entry.input))
    let def = definitions[0]?.input as DevframeServiceDefinition | undefined
    if (!def) {
      def = await this.importServiceDefinition(pkg, entries)
      if (!def)
        return undefined
    }

    this.checkVersionRanges(pkg, def, entries)
    const options = mergeInstallerOptions(def, entries)

    if (!this.context)
      throw diagnostics.DF0070({ package: pkg, reason: 'this services host has no node context to install into' })

    debug('installing service %s@%s (scope %s)', def.package, def.version, def.scope)
    const scoped = this.context.scope(def.scope)
    const api = await def.setup(scoped, options === undefined ? {} : { options })
    this.installed.set(pkg, api)
    this.provide(def.package, api as DevframeServiceOf<string>)
    await this.advertise(def)
    return api
  }

  /**
   * Import a descriptor-only package, run its factory, and validate the
   * resulting definition. Returns `undefined` when an optional package can't
   * be imported (the install is skipped); throws for a required one.
   */
  private async importServiceDefinition(
    pkg: string,
    entries: PendingServiceEntry[],
  ): Promise<DevframeServiceDefinition | undefined> {
    const descriptors = entries.map(entry => entry.input as DevframeServiceDescriptor)
    const required = descriptors.some(descriptor => descriptor.required === true)
    const cwd = this.context?.cwd ?? process.cwd()
    const resolveFroms = [
      ...entries.map(entry => entry.resolveFrom && expandResolveFrom(entry.resolveFrom, cwd)),
      this.context?.workspaceRoot,
      cwd,
    ]
    let mod: unknown
    try {
      mod = await importServicePackage(pkg, resolveFroms)
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (required)
        throw diagnostics.DF0067({ package: pkg, reason, cause: error })
      debug('optional service %s not importable, skipping: %s', pkg, reason)
      return undefined
    }
    const factory = (mod as { default?: unknown }).default
    if (typeof factory !== 'function')
      throw diagnostics.DF0070({ package: pkg, reason: 'its default export is not a factory function' })
    let def = await (factory as () => DevframeServiceDefinition | Promise<DevframeServiceDefinition>)()
    if (!def || typeof def.setup !== 'function')
      throw diagnostics.DF0070({ package: pkg, reason: 'its factory did not return a definition with a `setup` function' })
    if (typeof def.package !== 'string' || def.package.length === 0)
      def = { ...def, package: pkg }
    validateServiceDefinition(def)
    return def
  }

  /** Version-range checks against the resolved definition's real version. */
  private checkVersionRanges(pkg: string, def: DevframeServiceDefinition, entries: PendingServiceEntry[]): void {
    for (const entry of entries) {
      const descriptor = entry.input as DevframeServiceDescriptor
      if (isServiceDefinition(entry.input) || typeof descriptor.version !== 'string')
        continue
      if (satisfiesVersionRange(def.version, descriptor.version))
        continue
      if (descriptor.required === true)
        throw diagnostics.DF0068({ package: pkg, required: descriptor.version, installed: def.version })
      diagnostics.DF0069({ package: pkg, required: descriptor.version, installed: def.version })
    }
  }

  private advertisementState() {
    return this.context!.rpc.sharedState.get<DevframeServicesState>(
      DEVFRAME_SERVICES_STATE_KEY,
      { initialValue: {} },
    )
  }

  private async advertise(def: DevframeServiceDefinition): Promise<void> {
    const state = await this.advertisementState()
    const { package: pkg, version, scope, meta } = def
    state.mutate((value) => {
      value[pkg] = { package: pkg, version, scope, ...(meta ? { meta } : {}) }
    })
  }
}
