import type { OgHeadTag, OgSnapshot } from '../../../types'

export type Suggestion = 'optional' | 'recommended' | 'required'

export interface OgTagDefinition {
  name: string
  suggestion: Suggestion
  description: string
  docs?: string
}

export interface SocialCardData {
  title: string
  description: string
  image: string
  imageAlt: string
  url: string
  hostname: string
  favicon: string
  twitterCard: string
}

export const tagDefinitions: OgTagDefinition[] = [
  {
    name: 'title',
    suggestion: 'required',
    description: 'A concise browser title that identifies the page.',
    docs: 'https://developer.mozilla.org/docs/Web/HTML/Element/title',
  },
  {
    name: 'description',
    suggestion: 'required',
    description: 'A one or two sentence summary for search engines and link previews.',
  },
  {
    name: 'icon',
    suggestion: 'recommended',
    description: 'A small image that identifies the site in browser and social surfaces.',
  },
  {
    name: 'lang',
    suggestion: 'recommended',
    description: 'The primary language used by the page.',
  },
  {
    name: 'og:title',
    suggestion: 'recommended',
    description: 'The title shown by Open Graph consumers.',
    docs: 'https://ogp.me/#metadata',
  },
  {
    name: 'og:description',
    suggestion: 'recommended',
    description: 'The description shown by Open Graph consumers.',
    docs: 'https://ogp.me/#metadata',
  },
  {
    name: 'og:image',
    suggestion: 'recommended',
    description: 'The image used for rich social previews.',
    docs: 'https://ogp.me/#metadata',
  },
  {
    name: 'og:url',
    suggestion: 'recommended',
    description: 'The canonical URL represented by the social card.',
    docs: 'https://ogp.me/#metadata',
  },
  {
    name: 'twitter:card',
    suggestion: 'optional',
    description: 'The Twitter card layout, such as summary_large_image.',
    docs: 'https://developer.x.com/en/docs/x-for-websites/cards/overview/abouts-cards',
  },
  {
    name: 'twitter:title',
    suggestion: 'optional',
    description: 'A Twitter-specific title override.',
  },
  {
    name: 'twitter:description',
    suggestion: 'optional',
    description: 'A Twitter-specific description override.',
  },
  {
    name: 'twitter:image',
    suggestion: 'optional',
    description: 'A Twitter-specific preview image override.',
  },
]

export function findTag(tags: OgHeadTag[], ...names: string[]): string {
  for (const name of names) {
    const value = tags.find(tag => tag.name === name)?.value
    if (value)
      return value
  }
  return ''
}

export function toSocialCard(snapshot: OgSnapshot, useTwitterOverrides = false): SocialCardData {
  const tags = snapshot.tags
  const url = findTag(tags, 'og:url') || snapshot.url
  let hostname = url
  try {
    hostname = new URL(url).hostname
  }
  catch {}
  return {
    title: useTwitterOverrides
      ? findTag(tags, 'twitter:title', 'og:title', 'title')
      : findTag(tags, 'og:title', 'title'),
    description: useTwitterOverrides
      ? findTag(tags, 'twitter:description', 'og:description', 'description')
      : findTag(tags, 'og:description', 'description'),
    image: useTwitterOverrides
      ? findTag(tags, 'twitter:image', 'og:image')
      : findTag(tags, 'og:image'),
    imageAlt: useTwitterOverrides
      ? findTag(tags, 'twitter:image:alt', 'og:image:alt')
      : findTag(tags, 'og:image:alt'),
    url,
    hostname,
    favicon: findTag(tags, 'icon'),
    twitterCard: findTag(tags, 'twitter:card') || 'summary_large_image',
  }
}

export function createMissingTagSnippet(definitions: OgTagDefinition[]): string {
  const names = new Set(definitions.map(item => item.name))
  const values: Record<string, string> = {}
  if (names.has('title'))
    values.title = '[title]'
  if (names.has('description'))
    values.description = '[description]'
  if (names.has('og:title'))
    values.ogTitle = '[og:title]'
  if (names.has('og:description'))
    values.ogDescription = '[og:description]'
  if (names.has('og:image'))
    values.ogImage = '[og:image]'
  if (names.has('og:url'))
    values.ogUrl = '[og:url]'
  if (names.has('twitter:card'))
    values.twitterCard = 'summary_large_image'
  if (names.has('twitter:title'))
    values.twitterTitle = '[twitter:title]'
  if (names.has('twitter:description'))
    values.twitterDescription = '[twitter:description]'
  if (names.has('twitter:image'))
    values.twitterImage = '[twitter:image]'

  const lines = Object.entries(values).map(([key, value]) => `  ${key}: '${value}',`)
  return `useSeoMeta({\n${lines.join('\n')}\n})`
}
