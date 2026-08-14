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
 * and falls back to devframe's own identity. Published as
 * `ConnectionMeta.configs.ui.branding` via `createUi({ branding })`, and
 * read from the one connection handshake the dock already performs —
 * `ConnectionMeta` has its own cross-realm propagation (see
 * `DEVFRAME_CONNECTION_KEY`), so branding needs no globals or query params
 * of its own.
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

/**
 * Resolve branding at boot: install whatever `ConnectionMeta.configs.ui.branding`
 * carried from the connection handshake the dock already performed, and
 * return it. Called once the RPC client is connected, before the dock
 * element mounts, so branding is applied on the first paint.
 */
export function resolveBranding(branding: DevframeBranding | undefined): ResolvedBranding {
  return setBranding(branding ?? {})
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
