import type { DevToolsDiagnosticsHost as DevToolsDiagnosticsHostType, DevToolsDiagnosticsLogger, DevToolsNodeContext } from 'devframe/types'
import { defineDiagnostics } from 'nostics'
import { devframeReporter } from '../utils/diagnostics-reporter'

export class DevToolsDiagnosticsHost implements DevToolsDiagnosticsHostType {
  private _registry: Record<string, unknown> = {}

  readonly logger: DevToolsDiagnosticsLogger = new Proxy({} as DevToolsDiagnosticsLogger, {
    get: (_, code: string) => this._registry[code],
  })

  readonly defineDiagnostics: DevToolsDiagnosticsHostType['defineDiagnostics'] = (opts) => {
    const merged = {
      ...opts,
      reporters: [devframeReporter, ...(opts.reporters ?? [])],
    } as Parameters<typeof defineDiagnostics>[0]
    return defineDiagnostics(merged) as ReturnType<DevToolsDiagnosticsHostType['defineDiagnostics']>
  }

  constructor(
    public readonly context: DevToolsNodeContext,
    initialDefinitions: Array<Record<string, unknown>> = [],
  ) {
    for (const d of initialDefinitions)
      this.register(d)
  }

  register(diagnostics: Record<string, unknown>): void {
    Object.assign(this._registry, diagnostics)
  }
}
