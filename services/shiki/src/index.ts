import type { DevframeServiceDefinition } from 'devframe/types'
import type { BundledLanguage, codeToHast, codeToTokens, SpecialLanguage } from 'shiki'
import { defineRpcFunction } from 'devframe'
import { hash } from 'devframe/utils/hash'
import { s } from 'devframe/utils/simple-schema'
import pkg from '../package.json' with { type: 'json' }

export const SHIKI_SERVICE_PACKAGE = '@devframes/service-shiki'
export const SHIKI_SERVICE_SCOPE = 'devframes:service:shiki'

/** Dual light/dark theme pair, rendered via Shiki's dual-theme CSS variables. */
export interface ShikiThemes {
  light: string
  dark: string
}

/** Defaults matching the `@antfu/design` light/dark surfaces. */
export const SHIKI_DEFAULT_THEMES: ShikiThemes = { light: 'vitesse-light', dark: 'vitesse-dark' }

export interface ShikiServiceOptions {
  /**
   * Theme pair every request uses unless it carries its own. On merge, the
   * later installer's pair wins.
   */
  themes?: ShikiThemes
  /**
   * Languages to eagerly load at setup (others load on demand, per request).
   * Merged as a union across installers.
   */
  langs?: string[]
}

export interface ShikiHighlightInput {
  code: string
  /** Language id; unknown ids degrade to plain text instead of throwing. */
  lang?: string
  /** Per-request theme override. */
  themes?: ShikiThemes
}

export type ShikiHast = Awaited<ReturnType<typeof codeToHast>>
export type ShikiTokens = Awaited<ReturnType<typeof codeToTokens>>

export interface ShikiServiceApi {
  /** Highlight to HTML (dual-theme: light values inline, dark via `--shiki-dark` vars). */
  highlight: (input: ShikiHighlightInput) => Promise<{ html: string }>
  /** Highlight to a HAST tree, for surfaces that render their own DOM. */
  codeToHast: (input: ShikiHighlightInput) => Promise<ShikiHast>
  /** Highlight to themed tokens, for line-oriented renderers (e.g. diff views). */
  codeToTokens: (input: ShikiHighlightInput) => Promise<ShikiTokens>
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'devframes:service:shiki:highlight': (input: ShikiHighlightInput) => Promise<{ html: string }>
    'devframes:service:shiki:code-to-hast': (input: ShikiHighlightInput) => Promise<ShikiHast>
    'devframes:service:shiki:code-to-tokens': (input: ShikiHighlightInput) => Promise<ShikiTokens>
  }
  interface DevframeServicesRegistry {
    '@devframes/service-shiki': ShikiServiceApi
  }
  interface DevframeServicesScopeRegistry {
    '@devframes/service-shiki': 'devframes:service:shiki'
  }
}

/** Tiny insertion-order LRU — enough to absorb re-renders of the same code. */
class Lru<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.max && !this.map.has(key))
      this.map.delete(this.map.keys().next().value!)
    this.map.set(key, value)
  }
}

const inputSchema = s.object({
  code: s.string(),
  lang: s.optional(s.string()),
  themes: s.optional(s.object({ light: s.string(), dark: s.string() })),
})

/**
 * The Shiki wire service — server-side syntax highlighting shared by every
 * plugin on the host, so client bundles stop shipping their own grammars and
 * themes. Shiki itself loads lazily on first use; results are LRU-cached per
 * `(code, lang, themes)` and every RPC function is `cacheable` on the client
 * side too.
 */
export function createShikiService(options?: ShikiServiceOptions): DevframeServiceDefinition<ShikiServiceApi, ShikiServiceOptions> {
  return {
    package: SHIKI_SERVICE_PACKAGE,
    version: pkg.version,
    scope: SHIKI_SERVICE_SCOPE,
    options,
    // Option sets from multiple installers merge via devframe's default
    // deep-merge: `langs` union, `themes` deep-merged (per-key last-wins).
    setup(ctx, { options }) {
      const defaultThemes = options?.themes ?? SHIKI_DEFAULT_THEMES

      let shikiPromise: Promise<typeof import('shiki')> | undefined
      const shiki = () => shikiPromise ??= import('shiki').then(async (mod) => {
        // Eagerly warm the declared languages alongside the default themes.
        if (options?.langs?.length) {
          await mod.getSingletonHighlighter({
            langs: options.langs.filter(lang => lang in mod.bundledLanguages),
            themes: [defaultThemes.light, defaultThemes.dark],
          })
        }
        return mod
      })

      /** Unknown language ids degrade to plain text instead of throwing. */
      async function resolveLang(lang: string | undefined): Promise<BundledLanguage | SpecialLanguage> {
        if (!lang)
          return 'text'
        const mod = await shiki()
        return lang in mod.bundledLanguages || ['text', 'plaintext', 'txt', 'plain', 'ansi'].includes(lang)
          ? lang as BundledLanguage | SpecialLanguage
          : 'text'
      }

      const cache = new Lru<Promise<unknown>>(256)
      function cached<T>(kind: string, input: ShikiHighlightInput, compute: (lang: BundledLanguage | SpecialLanguage, themes: ShikiThemes) => Promise<T>): Promise<T> {
        const themes = input.themes ?? defaultThemes
        const key = hash([kind, input.lang, themes, input.code])
        let result = cache.get(key) as Promise<T> | undefined
        if (!result) {
          result = resolveLang(input.lang).then(lang => compute(lang, themes))
          cache.set(key, result)
        }
        return result
      }

      // The spread turns the `ShikiThemes` interface into an object-literal
      // type with an implicit index signature, as shiki's `themes` record
      // requires.
      const api: ShikiServiceApi = {
        highlight: input => cached('html', input, async (lang, themes) =>
          ({ html: await (await shiki()).codeToHtml(input.code, { lang, themes: { ...themes } }) })),
        codeToHast: input => cached('hast', input, async (lang, themes) =>
          (await shiki()).codeToHast(input.code, { lang, themes: { ...themes } })),
        codeToTokens: input => cached('tokens', input, async (lang, themes) =>
          (await shiki()).codeToTokens(input.code, { lang, themes: { ...themes } })),
      }

      // `s.object({})` is guard-only (extra keys survive) — a permissive
      // envelope for the structured HAST / tokens payloads.
      ctx.rpc.register(defineRpcFunction({
        name: 'highlight',
        type: 'query',
        cacheable: true,
        jsonSerializable: true,
        args: [inputSchema],
        returns: s.object({ html: s.string() }),
        handler: (input: ShikiHighlightInput) => api.highlight(input),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'code-to-hast',
        type: 'query',
        cacheable: true,
        jsonSerializable: true,
        args: [inputSchema],
        returns: s.object({}),
        handler: (input: ShikiHighlightInput) => api.codeToHast(input),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'code-to-tokens',
        type: 'query',
        cacheable: true,
        jsonSerializable: true,
        args: [inputSchema],
        returns: s.object({}),
        handler: (input: ShikiHighlightInput) => api.codeToTokens(input),
      }))

      return api
    },
  }
}

export default createShikiService
