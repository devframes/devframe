/** Broad category guessed from a file's extension, driving preview/icon choice. */
export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'text' | 'other'

/** One file under the managed directory. */
export interface AssetInfo {
  /** Path relative to the managed directory, posix-separated, no leading slash. */
  path: string
  type: AssetType
  /** URL the browser can fetch the raw bytes from (live adapters only). */
  publicPath: string
  size: number
  /** `mtimeMs` — milliseconds since epoch. */
  mtime: number
}

export interface AssetImageMeta {
  width?: number
  height?: number
  orientation?: number
}

/** A ready-to-copy usage snippet shown in the details panel. */
export interface CodeSnippet {
  lang: string
  code: string
  name: string
}

/** Mirrors Nuxt DevTools' own default upload allow-list. */
export const DEFAULT_ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'mp4',
  'ogg',
  'mp3',
  'wav',
  'mov',
  'mkv',
  'mpg',
  'txt',
  'ttf',
  'woff',
  'woff2',
  'eot',
]
