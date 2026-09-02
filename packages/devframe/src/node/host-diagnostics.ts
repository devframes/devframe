import type { DevframeDiagnosticsHost as DevframeDiagnosticsHostType, DevframeDiagnosticsLogger, DevframeNodeContext } from 'devframe/types'
import { defineDiagnostics } from 'devframe/utils/nostics'

export class DevframeDiagnosticsHost implements DevframeDiagnosticsHostType {
  private _registry: Record<string, unknown> = {}

  readonly logger: DevframeDiagnosticsLogger = new Proxy({} as DevframeDiagnosticsLogger, {
    get: (_, code: string) => this._registry[code],
  })

  /**
   * Already pre-wires devframe's ANSI console reporter, so no extra merging
   * needed here, the host's `defineDiagnostics` just is the shared one.
   */
  readonly defineDiagnostics: DevframeDiagnosticsHostType['defineDiagnostics'] = defineDiagnostics

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
