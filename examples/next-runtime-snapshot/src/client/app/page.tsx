'use client'

import { RpcProvider, useRpc } from './components/connect'
import { SnapshotEnv } from './components/snapshot-env'
import { SnapshotMemory } from './components/snapshot-memory'
import { SnapshotSystem } from './components/snapshot-system'

function StatusBar() {
  const { rpc, error } = useRpc()
  if (error) {
    return (
      <div className="status">
        <span className="err">
          connection failed —
          {' '}
          {error}
        </span>
      </div>
    )
  }
  if (!rpc) {
    return <div className="status">connecting…</div>
  }
  return (
    <div className="status">
      backend:
      {' '}
      <code>{rpc.connectionMeta.backend}</code>
    </div>
  )
}

export default function Page() {
  return (
    <RpcProvider>
      <main>
        <header>
          <h1>Next Runtime Snapshot</h1>
          <small>
            devframe + Next.js App Router · live RPC into the host Node process
          </small>
        </header>

        <div className="cards">
          <SnapshotSystem />
          <SnapshotMemory />
          <SnapshotEnv />
        </div>

        <StatusBar />
      </main>
    </RpcProvider>
  )
}
