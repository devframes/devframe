import { withDevframe } from '@devframes/next/single'

// `withDevframe` applies the settings a devframe host requires (currently
// `skipTrailingSlashRedirect: true`, so mounted SPAs' relative assets under
// `/__devframes/<id>/` resolve instead of 404-ing on Next's trailing-slash
// redirect).
/** @type {import('next').NextConfig} */
const nextConfig = withDevframe({
  images: { unoptimized: true },
  /**
   * @antfu/design ships raw, uncompiled `.ts`/`.vue` source (see its README -
   * "no bundling, your build compiles it"). `dockIconSvg` (design/dock-icon.ts)
   * imports its `utils/iconify.ts` directly, so Next/Turbopack - which
   * otherwise treats node_modules as pre-built and has no loader for a bare
   * `.ts` file there - needs to run this package through its own transform.
   */
  transpilePackages: ['@antfu/design'],
  /** The workspace typecheck owns source-level project references. */
  typescript: { ignoreBuildErrors: true },
})

export default nextConfig
