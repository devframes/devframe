/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // @antfu/design ships raw, uncompiled `.ts`/`.vue` source (see its README —
  // "no bundling, your build compiles it"). `dockIconSvg` (design/dock-icon.ts)
  // imports its `utils/iconify.ts` directly, so Next/Turbopack — which
  // otherwise treats node_modules as pre-built and has no loader for a bare
  // `.ts` file there — needs to run this package through its own transform.
  transpilePackages: ['@antfu/design'],
  // The workspace typecheck owns source-level project references.
  typescript: { ignoreBuildErrors: true },
  // Mounted devframe SPAs are served at `/__<id>/` and reference their assets
  // relatively (`./_next/…`, `./assets/…`). Next's default trailing-slash
  // redirect (`/__git/` → `/__git`) would re-root those relative paths and 404
  // every asset, leaving the panel unstyled and unable to connect. Serving the
  // base path verbatim keeps the SPA's relative asset resolution intact.
  skipTrailingSlashRedirect: true,
}

export default nextConfig
