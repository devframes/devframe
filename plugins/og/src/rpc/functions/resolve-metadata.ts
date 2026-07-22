import type { DevframeNodeContext } from 'devframe/types'
import type { OgFetch, OgSnapshot } from '../../types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import * as v from 'valibot'
import { diagnostics } from '../../diagnostics'
import { fetchOgMetadata } from '../../node/metadata'

export interface ResolveMetadataOptions {
  defaultUrl?: string
  fetch?: OgFetch
}

const EMPTY_SNAPSHOT: OgSnapshot = {
  requestedUrl: '',
  url: '',
  status: 0,
  fetchedAt: 0,
  tags: [],
}

const tagSchema = v.object({
  tag: v.picklist(['html', 'link', 'meta', 'title']),
  name: v.string(),
  value: v.string(),
})

const snapshotSchema = v.object({
  requestedUrl: v.string(),
  url: v.string(),
  status: v.number(),
  fetchedAt: v.number(),
  tags: v.array(tagSchema),
})

const defineOgRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export function createResolveMetadataRpc(options: ResolveMetadataOptions = {}) {
  return defineOgRpc({
    name: 'devframes:plugin:og:resolve-metadata',
    type: 'query',
    jsonSerializable: true,
    args: [v.object({ url: v.optional(v.string()) })],
    returns: snapshotSchema,
    agent: {
      title: 'Inspect Open Graph metadata',
      description: 'Fetch an HTTP or HTTPS page and return its normalized title, language, Open Graph, Twitter, and link metadata.',
      safety: 'read',
      tags: ['open-graph', 'seo'],
    },
    dump: async (_ctx, handler) => {
      if (!options.defaultUrl)
        throw diagnostics.DP_OG_0005()
      const input = { url: options.defaultUrl }
      const snapshot = await handler(input)
      return { records: [{ inputs: [input], output: snapshot }], fallback: snapshot }
    },
    setup: () => ({
      // The RPC runtime awaits handlers before validating `returns`; its public
      // setup type currently models schema-backed returns as synchronous.
      handler: (async ({ url = '' }): Promise<OgSnapshot> => {
        const target = url.trim() || options.defaultUrl?.trim()
        if (!target)
          return EMPTY_SNAPSHOT
        return fetchOgMetadata(target, options.fetch)
      }) as any,
    }),
  })
}

export const resolveMetadata = createResolveMetadataRpc()
