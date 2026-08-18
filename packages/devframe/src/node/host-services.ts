import type {
  DevframeNodeContext,
  DevframeServiceDefinition,
  DevframeServiceDescriptor,
  DevframeServiceId,
  DevframeServiceInput,
  DevframeServiceInstallOptions,
  DevframeServiceOf,
  DevframeServicesHost,
  DevframeServicesState,
} from 'devframe/types'
import { DEVFRAME_SERVICES_STATE_KEY } from 'devframe/constants'
import { createDebug } from 'obug'
import { diagnostics } from './diagnostics'
import { importServicePackage, satisfiesVersionRange, shallowMergeOptionSets } from './services-install'

const debug = createDebug('devframe:services')

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
 * Cross-plugin service registry (see `types/services.ts` for the contract).
 * Values are held per context instance; `whenAvailable` subscriptions make
 * the mechanism robust against setup ordering between provider and consumer.
 *
 * On top of the in-process `provide`/`get` tier, this host implements the
 * **wire-service** lifecycle: `install()` queues definitions/descriptors,
 * `ready()` fires the collect-then-setup barrier — importing descriptor
 * packages, merging option sets per service, constructing each service once,
 * providing its node API under the package name, and advertising it to
 * clients through the `devframe:services` shared state.
 */
export class DevframeServicesHostImpl implements DevframeServicesHost {
  private services = new Map<string, unknown>()
  private listeners = new Map<string, Set<(service: unknown) => void>>()
  private pending = new Map<string, PendingServiceEntry[]>()
  private installed = new Map<string, unknown>()
  private readyPromise: Promise<void> | undefined

  constructor(private context?: DevframeNodeContext) {}

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

  get isReady(): boolean {
    return this.readyPromise !== undefined
  }

  install<API = unknown, Options = any>(
    input: DevframeServiceInput<API, Options>,
    options?: DevframeServiceInstallOptions,
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
    // `install()` never crashes the process — awaiting callers (and the
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
      diagnostics.DF0066({ package: pkg })
      return this.installed.get(pkg)
    }

    const definitions = entries.filter(entry => isServiceDefinition(entry.input))
    let def = definitions[0]?.input as DevframeServiceDefinition | undefined

    if (!def) {
      const descriptors = entries.map(entry => entry.input as DevframeServiceDescriptor)
      const required = descriptors.some(descriptor => descriptor.required === true)
      const resolveFroms = [
        ...entries.map(entry => entry.resolveFrom),
        this.context?.workspaceRoot,
        this.context?.cwd,
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
      def = await (factory as () => DevframeServiceDefinition | Promise<DevframeServiceDefinition>)()
      if (!def || typeof def.setup !== 'function')
        throw diagnostics.DF0070({ package: pkg, reason: 'its factory did not return a definition with a `setup` function' })
      if (typeof def.package !== 'string' || def.package.length === 0)
        def = { ...def, package: pkg }
      validateServiceDefinition(def)
    }

    // Version-range checks against the resolved definition's real version.
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

    // Merge every installer's option set in declaration order (later wins on
    // the default shallow merge, so a host installing last takes precedence).
    const sets = entries
      .map(entry => entry.input.options)
      .filter(options => options !== undefined)
    const options = def.mergeOptions
      ? def.mergeOptions(sets)
      : sets.length > 0
        ? shallowMergeOptionSets(sets)
        : undefined

    if (!this.context)
      throw diagnostics.DF0070({ package: pkg, reason: 'this services host has no node context to install into' })

    debug('installing service %s@%s (scope %s)', def.package, def.version, def.scope)
    const scoped = this.context.scope(def.scope)
    const api = await def.setup(scoped, options === undefined ? {} : { options })
    this.installed.set(def.package, api)
    this.provide(def.package, api as DevframeServiceOf<string>)
    await this.advertise(def)
    return api
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
