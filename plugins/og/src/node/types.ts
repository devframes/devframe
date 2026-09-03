export type OgHeadTagName = 'html' | 'link' | 'meta' | 'title'

export interface OgHeadTag {
  tag: OgHeadTagName
  name: string
  value: string
}

export interface OgSnapshot {
  requestedUrl: string
  url: string
  status: number
  fetchedAt: number
  tags: OgHeadTag[]
}

export interface OgResolveInput {
  url?: string
}

export type OgFetch = (input: string, init: RequestInit) => Promise<Response>
