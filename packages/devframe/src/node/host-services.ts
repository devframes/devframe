import type { DevframeServiceId, DevframeServiceOf, DevframeServicesHost } from 'devframe/types'
import { diagnostics } from './diagnostics'

/**
 * Cross-plugin service registry (see `types/services.ts` for the contract).
 * Values are held per context instance; `whenAvailable` subscriptions make
 * the mechanism robust against setup ordering between provider and consumer.
 */
export class DevframeServicesHostImpl implements DevframeServicesHost {
  private services = new Map<string, unknown>()
  private listeners = new Map<string, Set<(service: unknown) => void>>()

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
}
