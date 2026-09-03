import type { AssetImageMeta, AssetInfo, CodeSnippet } from '../connect'
import { fileNameOf } from './format'

/**
 * Ready-to-copy usage snippets for the details panel. Generic by design:
 * unlike Nuxt DevTools' Nuxt-specific `<NuxtImg>`/`<NuxtPicture>` snippets,
 * these apply to any framework devframe might be embedded in.
 */
export function buildSnippets(asset: AssetInfo, imageMeta?: AssetImageMeta | null): CodeSnippet[] {
  const items: CodeSnippet[] = []
  const name = fileNameOf(asset.path)

  if (asset.type === 'image') {
    const attrs = imageMeta?.width && imageMeta?.height
      ? ` width="${imageMeta.width}" height="${imageMeta.height}"`
      : ''
    items.push({ name: 'Image tag', lang: 'html', code: `<img src="${asset.publicPath}"${attrs} />` })
    items.push({ name: 'CSS background', lang: 'css', code: `.element {\n  background-image: url('${asset.publicPath}');\n}` })
  }
  else if (asset.type === 'font') {
    const family = name.replace(/\.[^.]+$/, '')
    items.push({ name: '@font-face', lang: 'css', code: `@font-face {\n  font-family: '${family}';\n  src: url('${asset.publicPath}');\n}` })
  }
  else if (asset.type === 'video') {
    items.push({ name: 'Video tag', lang: 'html', code: `<video src="${asset.publicPath}" controls></video>` })
  }
  else if (asset.type === 'audio') {
    items.push({ name: 'Audio tag', lang: 'html', code: `<audio src="${asset.publicPath}" controls></audio>` })
  }

  items.push({ name: 'Download link', lang: 'html', code: `<a href="${asset.publicPath}" download>\n  Download ${name}\n</a>` })
  return items
}
