import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

/**
 * The static-export options (`output: 'export'`, a relative `assetPrefix`, and
 * `trailingSlash`) exist so `next build` emits a self-contained SPA that mounts
 * at any base. They are wrong for `next dev`: a relative `assetPrefix` breaks
 * the dev client runtime's chunk base, so the page never hydrates (no
 * interactivity, and the RPC client never connects). Apply them only for the
 * production build so `pnpm dev` hydrates normally.
 *
 * @type {(phase: string) => import('next').NextConfig}
 */
export default (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  return {
    ...(isDev ? {} : { output: 'export', assetPrefix: '.', trailingSlash: true }),
    images: { unoptimized: true },
    // The workspace tsconfig uses path aliases that point at devframe's
    // source so source-level edits HMR cleanly. Next.js's incremental TS
    // check can't follow workspace project references through those aliases
    // and ends up type-checking unrelated source. Defer typechecking to the
    // workspace's own `tsc -b` (`pnpm typecheck`), which honors references.
    typescript: { ignoreBuildErrors: true },
  }
}
