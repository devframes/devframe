import { existsSync, readdirSync } from 'node:fs'
import preset from 'comark-docs/lint.mjs'

// The site's own Markdown components, registered globally from app/components/global/.
const global = readdirSync('app/components/global').map(file =>
  file.replace(/\.(vue|ts)$/, '').replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase()),
)

export default {
  ...preset,
  components: [
    ...preset.components,
    ...global,
  ],
  links: {
    ...preset.links,
    routes: (path: string) =>
      // Vue pages, not Markdown.
      ['/chat', '/logos'].includes(path)
      // Static files, such as screenshots.
      || existsSync(`public${path}`)
      // comark-content lowercases page paths, and the site serves `/errors/DF0036` as well.
      || preset.links.routes(path.toLowerCase()),
  },
}
