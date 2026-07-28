import type { Stats } from 'node:fs'
import type { AssetInfo, AssetType } from '../types'
import fsp from 'node:fs/promises'
import { join } from 'pathe'
import { glob } from 'tinyglobby'
import { joinURL } from 'ufo'

const reImage = /\.(?:png|jpe?g|jxl|gif|svg|webp|avif|ico|bmp|tiff?)$/i
const reVideo = /\.(?:mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|ts|mts|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)$/i
const reAudio = /\.(?:mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)$/i
const reFont = /\.(?:woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)$/i
const reText = /\.(?:json[5c]?|te?xt|[mc]?[jt]sx?|md[cx]?|markdown|ya?ml|toml|csv)$/i

/** Classifies a path by extension, driving preview and icon choice. */
export function guessAssetType(path: string): AssetType {
  if (reImage.test(path))
    return 'image'
  if (reVideo.test(path))
    return 'video'
  if (reAudio.test(path))
    return 'audio'
  if (reFont.test(path))
    return 'font'
  if (reText.test(path))
    return 'text'
  return 'other'
}

function toPublicPath(rawBase: string, posixPath: string): string {
  const encoded = posixPath.split('/').map(encodeURIComponent).join('/')
  return joinURL(rawBase, encoded)
}

/** Builds an {@link AssetInfo} from an already-resolved `fs.Stats`. */
export function statToAssetInfo(dir: string, rawBase: string, relPath: string, stat: Stats): AssetInfo {
  const posixPath = relPath.replace(/\\/g, '/')
  return {
    path: posixPath,
    type: guessAssetType(posixPath),
    publicPath: toPublicPath(rawBase, posixPath),
    size: stat.size,
    mtime: stat.mtimeMs,
  }
}

/** Recursively lists every file under `dir`, sorted alphabetically by path. */
export async function scanAssets(dir: string, rawBase: string): Promise<AssetInfo[]> {
  const files = await glob(['**/*'], { cwd: dir, onlyFiles: true, dot: false })

  const infos = await Promise.all(files.map(async (relPath): Promise<AssetInfo | undefined> => {
    try {
      const stat = await fsp.lstat(join(dir, relPath))
      return statToAssetInfo(dir, rawBase, relPath, stat)
    }
    catch {
      // Removed between the glob scan and the stat call — drop it silently,
      // the next scan (or the live watcher) will settle.
      return undefined
    }
  }))

  return infos
    .filter((info): info is AssetInfo => info !== undefined)
    .sort((a, b) => a.path.localeCompare(b.path))
}
