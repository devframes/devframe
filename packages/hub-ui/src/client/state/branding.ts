import type { Ref } from 'vue'
import type { BrandingLogo, DevframeBranding } from '../../types'
import { computed, ref } from 'vue'
import { isDark } from './color-mode'

/** Branding with defaults resolved — what the UI actually renders. */
export interface ResolvedBranding {
  productName: string
  logo?: BrandingLogo
  wordmark?: BrandingLogo
  primaryColor?: string
  background: 'default' | 'transparent'
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
    background: branding.background || 'default',
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
