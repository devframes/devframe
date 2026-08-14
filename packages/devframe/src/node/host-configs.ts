import type { DevframeConfigsHost, DevframeConnectionConfigsRegistry } from 'devframe/types'

/**
 * Backs `ctx.configs` (see `types/context.ts` for the contract). Values
 * accumulate in memory for the life of the context — `resolve()` is read
 * once, after every contributor has run, to build the served
 * `ConnectionMeta.configs`.
 */
export class DevframeConfigsHostImpl implements DevframeConfigsHost {
  private readonly values: Partial<DevframeConnectionConfigsRegistry> = {}

  contribute<K extends keyof DevframeConnectionConfigsRegistry>(
    key: K,
    updater: (current: DevframeConnectionConfigsRegistry[K] | undefined) => DevframeConnectionConfigsRegistry[K],
  ): void {
    this.values[key] = updater(this.values[key])
  }

  resolve(): Partial<DevframeConnectionConfigsRegistry> {
    return this.values
  }
}
