import { watchDevframeTheme } from 'devframe/client'

// Match the reference dock's primary ramp. Only accent tokens change; semantic
// success/error/warning colors and each SPA's chart palettes stay independent.
const primaryStops = {
  DEFAULT: 0,
  50: 95,
  100: 90,
  200: 75,
  600: 9,
  500: 18,
  400: 34,
  300: 54,
  700: -8,
  800: -25,
  900: -45,
  950: -70,
} as const

/** Opt a built-in devframe SPA into the hub UI provider's primary accent. */
export function syncPanelTheme(): () => void {
  const style = document.documentElement.style
  const previous = Object.keys(primaryStops).map((stop) => {
    const name = `--colors-primary-${stop}`
    return { name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }
  })
  function restore() {
    for (const { name, value, priority } of previous) {
      if (value)
        style.setProperty(name, value, priority)
      else
        style.removeProperty(name)
    }
  }
  const stop = watchDevframeTheme(({ primaryColor }) => {
    if (!primaryColor || !CSS.supports('color', primaryColor)) {
      restore()
      return
    }
    for (const [stop, white] of Object.entries(primaryStops)) {
      style.setProperty(`--colors-primary-${stop}`, white
        ? `color-mix(in oklab, ${primaryColor}, ${white > 0 ? 'white' : 'black'} ${Math.abs(white)}%)`
        : primaryColor)
    }
  })
  return () => {
    stop()
    restore()
  }
}
