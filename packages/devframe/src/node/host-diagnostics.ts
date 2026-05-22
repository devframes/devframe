import type { DevframeDiagnosticsHost as DevframeDiagnosticsHostType, DevframeDiagnosticsLogger, DevframeNodeContext } from 'devframe/types'
import { defineDiagnostics } from 'nostics'
import { devframeReporter } from '../utils/diagnostics-reporter'

export class DevframeDiagnosticsHost implements DevframeDiagnosticsHostType {
  private _registry: Record<string, unknown> = {}

  readonly logger: DevframeDiagnosticsLogger = new Proxy({} as DevframeDiagnosticsLogger, {
    get: (_, code: string) => this._registry[code],
  })

  readonly defineDiagnostics: DevframeDiagnosticsHostType['defineDiagnostics'] = (opts) => {
    const merged = {
      ...opts,
      reporters: [devframeReporter, ...(opts.reporters ?? [])],
    } as Parameters<typeof defineDiagnostics>[0]
    return defineDiagnostics(merged) as ReturnType<DevframeDiagnosticsHostType['defineDiagnostics']>
  }

  constructor(
    public readonly context: DevframeNodeContext,
    initialDefinitions: Array<Record<string, unknown>> = [],
  ) {
    for (const d of initialDefinitions)
      this.register(d)
  }

  register(diagnostics: Record<string, unknown>): void {
    Object.assign(this._registry, diagnostics)
  }
}
