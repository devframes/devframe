import type { OgSnapshot } from '../src/types'
import { describe, expect, it } from 'vitest'
import { toSocialCard } from '../src/spa/app/utils/metadata'

const snapshot: OgSnapshot = {
  requestedUrl: 'https://example.com/article',
  url: 'https://example.com/article',
  status: 200,
  fetchedAt: 1,
  tags: [
    { tag: 'meta', name: 'og:title', value: 'Open Graph title' },
    { tag: 'meta', name: 'og:description', value: 'Open Graph description' },
    { tag: 'meta', name: 'og:image', value: 'https://example.com/og.png' },
    { tag: 'meta', name: 'twitter:title', value: 'Twitter title' },
    { tag: 'meta', name: 'twitter:description', value: 'Twitter description' },
    { tag: 'meta', name: 'twitter:image', value: 'https://example.com/twitter.png' },
  ],
}

describe('social card metadata', () => {
  it('uses Open Graph values for general previews', () => {
    expect(toSocialCard(snapshot)).toMatchObject({
      title: 'Open Graph title',
      description: 'Open Graph description',
      image: 'https://example.com/og.png',
    })
  })

  it('prefers Twitter overrides only for the Twitter preview', () => {
    expect(toSocialCard(snapshot, true)).toMatchObject({
      title: 'Twitter title',
      description: 'Twitter description',
      image: 'https://example.com/twitter.png',
    })
  })
})
