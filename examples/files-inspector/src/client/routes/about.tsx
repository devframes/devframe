import type { InspectorCtx } from '../app'
import { useEffect, useState } from 'preact/hooks'

export function About({ ctx, basePath }: { ctx: InspectorCtx, basePath: string }) {
  const [cwd, setCwd] = useState<string>('')

  useEffect(() => {
    ctx.rpc.call('get-cwd').then((r) => {
      setCwd(r.cwd)
    })
  }, [ctx])

  return (
    <section>
      <h2>About</h2>
      <p>
        This page demonstrates that the SPA discovers its mount path at
        runtime — the same bundle works under any base path.
      </p>
      <dl>
        <dt>Resolved base path</dt>
        <dd><code>{basePath}</code></dd>
        <dt>Server cwd</dt>
        <dd><code>{cwd || '…'}</code></dd>
        <dt>RPC backend</dt>
        <dd><code>{ctx.base.connectionMeta.backend}</code></dd>
      </dl>
    </section>
  )
}
