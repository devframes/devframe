import UnoCSS from '@unocss/postcss'

// Rsbuild's PostCSS loader resolves plugins eagerly, so pass the plugin
// instance directly (the string form leaves the ESM namespace unresolved —
// "[object Module] is not a PostCSS plugin").
export default {
  plugins: [UnoCSS()],
}
