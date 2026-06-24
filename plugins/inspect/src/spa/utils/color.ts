export function getHashColorFromString(
  name: string,
  opacity: number | string = 1,
) {
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return getHsla(h, opacity)
}

export function getHsla(
  hue: number,
  opacity: number | string = 1,
) {
  // Using generic values suitable for dark theme, or maybe query a CSS variable for dark mode if we want
  const saturation = 60
  const lightness = 50
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`
}
