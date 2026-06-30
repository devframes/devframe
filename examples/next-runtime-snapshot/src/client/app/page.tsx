'use client'

import { RpcProvider, useRpc } from './components/connect'
import { SnapshotEnv } from './components/snapshot-env'
import { SnapshotMemory } from './components/snapshot-memory'
import { SnapshotSystem } from './components/snapshot-system'
import { nav, navBrand } from './design'

function StatusBar() {
  const { ctx, error } = useRpc()
  const dot = error
    ? 'inline-block size-1.5 rounded-full shrink-0 bg-error'
    : ctx
      ? 'inline-block size-1.5 rounded-full shrink-0 bg-success'
      : 'inline-block size-1.5 rounded-full shrink-0 bg-neutral-400'
  return (
    <span className="flex items-center gap-2 text-xs color-muted">
      <span className={dot} />
      {error
        ? (
            <span className="text-error">
              connection failed —
              {' '}
              {error}
            </span>
          )
        : ctx
          ? (
              <>
                backend:
                {' '}
                <code className="font-mono color-base">{ctx.base.connectionMeta.backend}</code>
              </>
            )
          : 'connecting…'}
    </span>
  )
}

export default function Page() {
  return (
    <RpcProvider>
      <div className="flex min-h-dvh flex-col bg-base color-base font-sans">
        <header className={nav()}>
          <span className={navBrand()}>
            <span className="i-ph-pulse-duotone text-base color-active" />
            <span>Runtime Snapshot</span>
          </span>
          <span className="flex-1" />
          <StatusBar />
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 sm:p-6">
          <p className="text-sm color-muted">
            devframe + Next.js App Router · live RPC into the host Node process
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SnapshotSystem />
            <SnapshotMemory />
            <SnapshotEnv />
          </div>
        </main>
      </div>
    </RpcProvider>
  )
}
