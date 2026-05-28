import type { Diagnostic } from 'nostics'
import { colors as c } from 'devframe/utils/colors'
import { ansiFormatter } from 'nostics/formatters/ansi'

const formatAnsi = ansiFormatter(c)

export interface HubReporterOptions { method?: 'log' | 'warn' | 'error' }

export function hubReporter(d: Diagnostic, { method = 'warn' }: HubReporterOptions = {}): void {
  // eslint-disable-next-line no-console
  console[method](formatAnsi(d))
}
