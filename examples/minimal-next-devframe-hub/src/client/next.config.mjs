/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
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
