import { defineNitroConfig } from 'nitro/config'

// The devframe packages resolve their prebuilt client assets relative to
// import.meta.url — keep them external so those paths stay inside the
// packages instead of pointing into Nitro's build output (workspace-linked
// packages are otherwise inlined by the dev bundler).
const devframePackages = [
  'devframe',
  '@devframes/hub',
  '@devframes/hub/initiate',
  '@devframes/hub-ui',
  '@devframes/plugin-a11y',
  '@devframes/plugin-assets',
  '@devframes/plugin-code-server',
  '@devframes/plugin-data-inspector',
  '@devframes/plugin-git',
  '@devframes/plugin-inspect',
  '@devframes/plugin-messages',
  '@devframes/plugin-og',
  '@devframes/plugin-terminals',
]

export default defineNitroConfig({
  compatibilityDate: '2026-08-01',
  serverDir: '.',
  rolldownConfig: {
    external: id => devframePackages.some(name => id === name || id.startsWith(`${name}/`)),
  },
})
