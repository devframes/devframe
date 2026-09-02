import type { OgHeadTag, OgSnapshot } from '../../../types'

/**
 * A static, fully-populated Open Graph snapshot so the presentational
 * components render in isolation without a live fetch. Image URLs are
 * illustrative - they resolve to the broken-image placeholder offline, which
 * is itself a useful preview state.
 */
export const fullTags: OgHeadTag[] = [
  { tag: 'title', name: 'title', value: 'Devframe - the container for one devtool integration' },
  { tag: 'meta', name: 'description', value: 'Build a single devtool - its RPC, SPA, diagnostics - portable across viewers.' },
  { tag: 'html', name: 'lang', value: 'en' },
  { tag: 'link', name: 'icon', value: 'https://devfra.me/favicon.svg' },
  { tag: 'meta', name: 'og:title', value: 'Devframe' },
  { tag: 'meta', name: 'og:description', value: 'The framework-neutral container for one devtool integration.' },
  { tag: 'meta', name: 'og:image', value: 'https://devfra.me/og.png' },
  { tag: 'meta', name: 'og:url', value: 'https://devfra.me/' },
  { tag: 'meta', name: 'twitter:card', value: 'summary_large_image' },
  { tag: 'meta', name: 'twitter:title', value: 'Devframe' },
  { tag: 'meta', name: 'twitter:description', value: 'One devtool, portable to many viewers.' },
  { tag: 'meta', name: 'twitter:image', value: 'https://devfra.me/og.png' },
]

/** A snapshot missing every Open Graph / Twitter tag - exercises MissingTags. */
export const sparseTags: OgHeadTag[] = [
  { tag: 'title', name: 'title', value: 'Untitled page' },
  { tag: 'meta', name: 'description', value: 'A page with only the basics filled in.' },
]

function snapshotFrom(tags: OgHeadTag[]): OgSnapshot {
  return {
    requestedUrl: 'https://devfra.me/',
    url: 'https://devfra.me/',
    status: 200,
    fetchedAt: Date.now(),
    tags,
  }
}

export const fullSnapshot: OgSnapshot = snapshotFrom(fullTags)
export const sparseSnapshot: OgSnapshot = snapshotFrom(sparseTags)
