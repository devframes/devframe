// @unocss-include — the `i-catppuccin:*` classes below are assembled by path at
// runtime, so this marker forces UnoCSS to emit every one of them.
//
// A local port of `@antfu/design`'s `FileIcon` (its `utils/icon`), mapping a
// file path to a catppuccin icon class. Ported rather than imported so the React
// surface stays self-contained and its UnoCSS build extracts the finite icon set
// straight from this file. See `@antfu/design/utils/icon` for the source list.

interface FileIconRule {
  match: RegExp
  icon: string
}

// Ordered so the first match wins (e.g. `.d.ts` before `.ts`).
const FILE_ICON_RULES: FileIconRule[] = [
  { match: /package\.json$/, icon: 'i-catppuccin:npm' },
  { match: /(?:^|\/)tsconfig(?:\.\w+)?\.json$/, icon: 'i-catppuccin:typescript-config' },
  { match: /\.(?:test|spec)\.[cm]?[jt]sx?$/, icon: 'i-catppuccin:typescript-test' },
  { match: /\.vue$/, icon: 'i-catppuccin:vue' },
  { match: /\.svelte$/, icon: 'i-catppuccin:svelte' },
  { match: /\.tsx$/, icon: 'i-catppuccin:typescript-react' },
  { match: /\.jsx$/, icon: 'i-catppuccin:javascript-react' },
  { match: /\.d\.[cm]?ts$/, icon: 'i-catppuccin:typescript-def' },
  { match: /\.[cm]?ts$/, icon: 'i-catppuccin:typescript' },
  { match: /\.[cm]?js$/, icon: 'i-catppuccin:javascript' },
  { match: /\.json5?$/, icon: 'i-catppuccin:json' },
  { match: /\.ya?ml$/, icon: 'i-catppuccin:yaml' },
  { match: /\.toml$/, icon: 'i-catppuccin:toml' },
  { match: /\.mdx?$/, icon: 'i-catppuccin:markdown' },
  { match: /\.html?$/, icon: 'i-catppuccin:html' },
  { match: /\.(?:css|postcss)$/, icon: 'i-catppuccin:css' },
  { match: /\.s[ac]ss$/, icon: 'i-catppuccin:sass' },
  { match: /\.less$/, icon: 'i-catppuccin:less' },
  { match: /\.svg$/, icon: 'i-catppuccin:svg' },
  { match: /\.(?:png|jpe?g|gif|webp|avif|ico)$/, icon: 'i-catppuccin:image' },
  { match: /\.(?:woff2?|ttf|otf|eot)$/, icon: 'i-catppuccin:font' },
  { match: /\.wasm$/, icon: 'i-catppuccin:webassembly' },
  { match: /\.(?:sh|bash|zsh|fish)$/, icon: 'i-catppuccin:bash' },
  { match: /\.py$/, icon: 'i-catppuccin:python' },
  { match: /\.rs$/, icon: 'i-catppuccin:rust' },
  { match: /\.go$/, icon: 'i-catppuccin:go' },
  { match: /\.(?:xlsx?|csv)$/, icon: 'i-catppuccin:table' },
  { match: /(?:^|\/)\.gitignore$/, icon: 'i-catppuccin:git' },
  { match: /(?:^|\/)LICENSE(?:\.\w+)?$/, icon: 'i-catppuccin:license' },
]

const FALLBACK_FILE_ICON = 'i-catppuccin:file'

/** Resolve the catppuccin icon class for a file path (query/hash stripped). */
export function getFileIcon(path: string): string {
  const clean = path.replace(/[?#].*$/, '')
  for (const rule of FILE_ICON_RULES) {
    if (rule.match.test(clean))
      return rule.icon
  }
  return FALLBACK_FILE_ICON
}
