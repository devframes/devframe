import type { InspectorCtx } from '../app'
import { useEffect, useState } from 'preact/hooks'

export function About({ ctx, basePath }: { ctx: InspectorCtx, basePath: string }) {
  const [cwd, setCwd] = useState<string>('')

  useEffect(() => {
    ctx.rpc.call('get-cwd').then((r) => {
      setCwd(r.cwd)
    })
  }, [ctx])

  const rows = [
    { label: 'Resolved base path', value: basePath, icon: 'i-ph-path-duotone' },
    { label: 'Server cwd', value: cwd || '…', icon: 'i-ph-folder-duotone' },
    { label: 'RPC backend', value: ctx.base.connectionMeta.backend, icon: 'i-ph-plugs-connected-duotone' },
  ]

  return (
    <section class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div class="flex items-center gap-2">
        <span class="i-ph-info-duotone text-lg color-active" />
        <h2 class="text-base font-semibold">About</h2>
      </div>

      <p class="text-sm text-muted-foreground">
        This page demonstrates that the SPA discovers its mount path at runtime —
        the same bundle works under any base path.
      </p>

      <dl class="overflow-hidden rounded-md border border-border bg-card text-card-foreground">
        {rows.map(({ label, value, icon }) => (
          <div
            key={label}
            class="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
          >
            <span class={`${icon} shrink-0 text-muted-foreground`} />
            <dt class="w-40 shrink-0 text-sm text-muted-foreground">{label}</dt>
            <dd class="m-0 min-w-0 flex-1 truncate font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
