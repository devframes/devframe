import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { isDark } from './color-mode'

/**
 * A logo asset — a single URL/data-URI, or per-color-scheme variants. The dark
 * variant falls back to the light one when only `light` is given (or a bare
 * string is used for both).
 */
export type BrandingLogo = string | { light: string, dark: string }

/**
 * Consumer-facing branding for the reference hub-ui. Every field is optional
 * and falls back to devframe's own identity. Delivered three ways, merged
 * field-by-field (later wins): the `branding.json` `createUi({ branding })`
 * publishes, then the host page (a `window.__DEVFRAME_BRANDING__` global or
 * `data-*` attrs on the embedding `<script>`, or `?query` params on the
 * standalone viewer).
 */
export interface DevframeBranding {
  /** Product name — the wordmark, window titles, and all user-visible copy. */
  productName?: string
  /** Logo mark (URL / data-URI), rendered via `<img>`. */
  logo?: BrandingLogo
  /** Optional standalone wordmark image; when absent, mark + productName text is composed. */
  wordmark?: BrandingLogo
  /** Brand color; feeds `--devframe-primary` and the whole primary ramp. */
  primaryColor?: string
  /** Short line for the auth screen and the standalone meta description. */
  tagline?: string
  /** Favicon URL — applied on the standalone viewer and the popped-out window only. */
  favicon?: string
  /** Window/tab title; defaults to `productName`. */
  windowTitle?: string
}

/** Branding with defaults resolved — what the UI actually renders. */
export interface ResolvedBranding {
  productName: string
  logo?: BrandingLogo
  wordmark?: BrandingLogo
  primaryColor?: string
  tagline?: string
  favicon?: string
  windowTitle: string
}

const DEFAULT_PRODUCT_NAME = 'Devframes'

function resolveDefaults(branding: DevframeBranding): ResolvedBranding {
  const productName = branding.productName?.trim() || DEFAULT_PRODUCT_NAME
  return {
    productName,
    logo: branding.logo,
    wordmark: branding.wordmark,
    primaryColor: branding.primaryColor,
    tagline: branding.tagline,
    favicon: branding.favicon,
    windowTitle: branding.windowTitle?.trim() || productName,
  }
}

const currentBranding = ref<ResolvedBranding>(resolveDefaults({}))

/** The active resolved branding — read by every branded surface. */
export function useBranding(): Ref<ResolvedBranding> {
  return currentBranding
}

/** Install the resolved branding (called once at boot, before mount). */
export function setBranding(branding: DevframeBranding): ResolvedBranding {
  currentBranding.value = resolveDefaults(branding)
  return currentBranding.value
}

/** The logo/wordmark URL for the current color scheme, reactive to it. */
export function useBrandingLogo(pick: (b: ResolvedBranding) => BrandingLogo | undefined = b => b.logo): Ref<string | undefined> {
  return computed(() => resolveLogo(pick(currentBranding.value), isDark.value))
}

function resolveLogo(logo: BrandingLogo | undefined, dark: boolean): string | undefined {
  if (!logo)
    return undefined
  if (typeof logo === 'string')
    return logo
  return dark ? (logo.dark || logo.light) : logo.light
}

// --- Merge + host-page reading -------------------------------------------

/** Field-level merge; later layers override earlier ones (empty values skip). */
function mergeBranding(...layers: Array<DevframeBranding | undefined>): DevframeBranding {
  const out: DevframeBranding = {}
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object')
      continue
    for (const key of Object.keys(layer) as (keyof DevframeBranding)[]) {
      const value = layer[key]
      if (value !== undefined && value !== null && value !== '')
        (out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

function readWindowGlobal(): DevframeBranding | undefined {
  const global = (globalThis as { __DEVFRAME_BRANDING__?: unknown }).__DEVFRAME_BRANDING__
  return global && typeof global === 'object' ? global as DevframeBranding : undefined
}

const SCRIPT_ATTR_MAP: Record<string, keyof DevframeBranding> = {
  'data-product-name': 'productName',
  'data-primary-color': 'primaryColor',
  'data-logo': 'logo',
  'data-tagline': 'tagline',
  'data-window-title': 'windowTitle',
}

function findEmbeddedScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined')
    return null
  const current = document.currentScript as HTMLScriptElement | null
  if (current?.src)
    return current
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
  return scripts.find(script => /embedded\.js(?:$|[?#])/.test(script.src)) ?? null
}

function readScriptDataAttrs(): DevframeBranding {
  const out: DevframeBranding = {}
  const script = findEmbeddedScript()
  if (!script)
    return out
  for (const [attr, key] of Object.entries(SCRIPT_ATTR_MAP)) {
    const value = script.getAttribute(attr)
    if (value != null)
      (out as Record<string, unknown>)[key] = value
  }
  return out
}

const QUERY_PARAM_MAP: Record<string, keyof DevframeBranding> = {
  productName: 'productName',
  primaryColor: 'primaryColor',
  logo: 'logo',
  tagline: 'tagline',
  windowTitle: 'windowTitle',
}

function readQueryParams(): DevframeBranding {
  const out: DevframeBranding = {}
  if (typeof location === 'undefined')
    return out
  const params = new URLSearchParams(location.search)
  for (const [param, key] of Object.entries(QUERY_PARAM_MAP)) {
    const value = params.get(param)
    if (value != null)
      (out as Record<string, unknown>)[key] = value
  }
  return out
}

async function fetchBrandingJson(url: string | URL): Promise<DevframeBranding | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok)
      return undefined
    const json = await res.json()
    return json && typeof json === 'object' ? json as DevframeBranding : undefined
  }
  catch {
    // A missing branding.json (embedded-only without the assets seam, offline,
    // etc.) is expected — fall back to defaults + any host-page override.
    return undefined
  }
}

/**
 * Resolve branding at boot: fetch the served `branding.json`, layer the
 * host-page channels over it (they win per field), install the result, and
 * return it. Awaited before the dock element mounts, so branding is applied on
 * the first paint.
 */
export async function resolveBranding(options: {
  mode: 'embedded' | 'standalone'
  brandingUrl: string | URL
}): Promise<ResolvedBranding> {
  const fetched = await fetchBrandingJson(options.brandingUrl)
  const hostPage = options.mode === 'embedded'
    ? mergeBranding(readScriptDataAttrs(), readWindowGlobal())
    : mergeBranding(readQueryParams(), readWindowGlobal())
  return setBranding(mergeBranding(fetched, hostPage))
}

// --- Applying to the DOM --------------------------------------------------

/** Set the primary color on the dock host element (retints the whole ramp). */
export function applyPrimaryColor(host: HTMLElement, color: string | undefined): void {
  if (color)
    host.style.setProperty('--devframe-primary', color)
}

function setMeta(doc: Document, name: string, content: string): void {
  let meta = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = doc.createElement('meta')
    meta.setAttribute('name', name)
    doc.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

function setFavicon(doc: Document, href: string): void {
  let link = doc.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = doc.createElement('link')
    link.setAttribute('rel', 'icon')
    doc.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

/**
 * Apply title/favicon/description to a document the UI owns (the standalone
 * page and the popped-out window). The embedded bootstrap never calls this —
 * it must not rewrite the host page's head.
 */
export function applyDocumentHead(doc: Document, branding: ResolvedBranding): void {
  doc.title = branding.windowTitle
  if (branding.tagline)
    setMeta(doc, 'description', branding.tagline)
  if (branding.favicon)
    setFavicon(doc, branding.favicon)
}
