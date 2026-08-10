import { withDevframe } from '@devframes/next'

// `withDevframe` applies the settings a devframe host requires (currently
// `skipTrailingSlashRedirect: true`, so mounted SPAs' relative assets under
// `/__devframes/<id>/` resolve instead of 404-ing on Next's trailing-slash
// redirect).
/** @type {import('next').NextConfig} */
const nextConfig = withDevframe({
  // The plugin packages and @devframes/hub-ui are loaded through a
  // bundler-ignored dynamic `import()` in `hub.ts`, so Next resolves their
  // published `dist` at runtime (their `import.meta.url` asset lookups don't
  // survive static bundling). Nothing extra to externalize here.
  // The workspace typecheck owns source-level project references.
  typescript: { ignoreBuildErrors: true },
})

export default nextConfig
