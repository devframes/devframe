export function formatFileSize(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(2)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

const UNITS: [number, string][] = [
  [60, 'just now'],
  [60 * 60, 'm'],
  [60 * 60 * 24, 'h'],
  [60 * 60 * 24 * 30, 'd'],
  [60 * 60 * 24 * 365, 'mo'],
]

export function formatTimeAgo(mtime: number): string {
  const seconds = Math.floor((Date.now() - mtime) / 1000)
  if (seconds < 60)
    return 'just now'
  if (seconds < UNITS[1][0])
    return `${Math.floor(seconds / 60)}m ago`
  if (seconds < UNITS[2][0])
    return `${Math.floor(seconds / (60 * 60))}h ago`
  if (seconds < UNITS[3][0])
    return `${Math.floor(seconds / (60 * 60 * 24))}d ago`
  if (seconds < UNITS[4][0])
    return `${Math.floor(seconds / (60 * 60 * 24 * 30))}mo ago`
  return `${Math.floor(seconds / (60 * 60 * 24 * 365))}y ago`
}

export function extensionOf(path: string): string | undefined {
  const match = /\.([^./]+)$/.exec(path)
  return match?.[1]?.toLowerCase()
}

export function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path
}

/** Folder a path lives in, with a trailing slash — `''` for the root. */
export function folderOf(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.length ? `${parts.join('/')}/` : ''
}
