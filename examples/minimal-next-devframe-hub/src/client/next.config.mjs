/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // The workspace typecheck owns source-level project references.
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
