/**
 * A colorizer — callable as a function (`colors.red('foo')`) or as a
 * tagged template (``colors.red`foo ${bar}` ``).
 */
export interface ColorFn {
  (text: unknown): string
  (template: TemplateStringsArray, ...values: unknown[]): string
}

/**
 * Minimal terminal color palette. Each entry is callable as both a
 * plain function and a tagged template.
 */
export interface Colors {
  blue: ColorFn
  cyan: ColorFn
  gray: ColorFn
  green: ColorFn
  red: ColorFn
  yellow: ColorFn
  bold: ColorFn
  dim: ColorFn
  reset: ColorFn
  underline: ColorFn
}

function makeColor(open: number, close: number): ColorFn {
  const o = `\x1B[${open}m`
  const c = `\x1B[${close}m`
  return ((arg: unknown, ...values: unknown[]): string => {
    if (Array.isArray(arg) && 'raw' in arg) {
      const strings = arg as unknown as TemplateStringsArray
      let out = ''
      for (let i = 0; i < strings.length; i++) {
        out += strings[i]
        if (i < values.length)
          out += String(values[i])
      }
      return `${o}${out}${c}`
    }
    return `${o}${String(arg)}${c}`
  }) as ColorFn
}

export const colors: Colors = {
  blue: makeColor(34, 39),
  cyan: makeColor(36, 39),
  gray: makeColor(90, 39),
  green: makeColor(32, 39),
  red: makeColor(31, 39),
  yellow: makeColor(33, 39),
  bold: makeColor(1, 22),
  dim: makeColor(2, 22),
  reset: makeColor(0, 0),
  underline: makeColor(4, 24),
}
