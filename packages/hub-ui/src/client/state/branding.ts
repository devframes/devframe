import type { Ref } from 'vue'
import type { BrandingLogo, ColorSchemeValue, DevframeBranding, ViewerBackground } from '../../types'
import { computed, ref } from 'vue'
import { isDark } from './color-mode'

/** Branding with defaults resolved - what the UI actually renders. */
export interface ResolvedBranding {
  productName: string
  logo?: BrandingLogo
  wordmark?: BrandingLogo
  primaryColor?: string
  background?: DevframeBranding['background']
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
    background: branding.background,
    tagline: branding.tagline,
    favicon: branding.favicon,
    windowTitle: branding.windowTitle?.trim() || productName,
  }
}

const currentBranding = ref<ResolvedBranding>(resolveDefaults({}))

/** The active resolved branding - read by every branded surface. */
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
  return computed(() => resolveColorSchemeValue(pick(currentBranding.value), isDark.value))
}

/** The standalone viewer background for its frame context and current color scheme. */
export function useBrandingBackground(viewerContext: 'standalone' | 'iframe'): Ref<string | undefined> {
  return computed(() => {
    const configuredBackground = currentBranding.value.background

    if (!isContextualViewerBackground(configuredBackground))
      return resolveColorSchemeValue(configuredBackground, isDark.value)

    let contextualBackground = configuredBackground.standalone
    if (viewerContext === 'iframe')
      contextualBackground = configuredBackground.iframe ?? contextualBackground

    return resolveColorSchemeValue(contextualBackground, isDark.value)
  })
}

function isContextualViewerBackground(value: unknown): value is Extract<ViewerBackground, { standalone: ColorSchemeValue }> {
  return typeof value === 'object' && value !== null && 'standalone' in value
}

function resolveColorSchemeValue(value: ColorSchemeValue | undefined, dark: boolean): string | undefined {
  if (!value)
    return undefined
  if (typeof value === 'string')
    return value
  return dark ? (value.dark ?? value.light) : value.light
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
 * page and the popped-out window). The embedded bootstrap never calls this -
 * it must not rewrite the host page's head.
 */
export function applyDocumentHead(doc: Document, branding: ResolvedBranding): void {
  doc.title = branding.windowTitle
  if (branding.tagline)
    setMeta(doc, 'description', branding.tagline)
  if (branding.favicon)
    setFavicon(doc, branding.favicon)
}
