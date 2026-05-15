import type { Diagnostic } from 'nostics'
import { colors as c } from 'devframe/utils/colors'
import { ansiFormatter } from 'nostics/formatters/ansi'

const formatAnsi = ansiFormatter(c)

export interface DevframeReporterOptions { method?: 'log' | 'warn' | 'error' }

export function devframeReporter(d: Diagnostic, { method = 'warn' }: DevframeReporterOptions = {}): void {
  // eslint-disable-next-line no-console
  console[method](formatAnsi(d))
}
