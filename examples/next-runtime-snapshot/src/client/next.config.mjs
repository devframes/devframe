/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  assetPrefix: '.',
  trailingSlash: true,
  images: { unoptimized: true },
  // The workspace tsconfig uses path aliases that point at devframe's
  // source so source-level edits HMR cleanly. Next.js's incremental TS
  // check can't follow workspace project references through those aliases
  // and ends up type-checking unrelated source. Defer typechecking to the
  // workspace's own `tsc -b` (`pnpm typecheck`), which honors references.
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
