import type { InspectorCtx } from '../app'
import { useEffect, useState } from 'preact/hooks'
import { badge, button } from '../design'

export function Home({ ctx }: { ctx: InspectorCtx }) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      // Scoped call — `list-files` resolves to `devframe-files-inspector:list-files`.
      const result = await ctx.rpc.call('list-files')
      setFiles(result)
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <section class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div class="flex items-center gap-2">
        <span class="i-ph-files-duotone text-lg color-active" />
        <h2 class="text-base font-semibold">Files</h2>
        <span class={badge({ variant: 'secondary', class: 'font-mono tabular-nums' })}>
          {files.length}
        </span>
        <span class="flex-1" />
        <button
          type="button"
          class={button({ variant: 'outline', size: 'sm' })}
          onClick={refresh}
          disabled={loading}
        >
          <span class={loading ? 'i-ph-arrows-clockwise animate-spin' : 'i-ph-arrows-clockwise'} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div class="overflow-hidden rounded-md border border-base bg-base color-base">
        {files.length === 0
          ? (
              <p class="px-3 py-10 text-center text-sm color-muted">
                {loading ? 'Loading files…' : 'No files in the working directory.'}
              </p>
            )
          : (
              <ul>
                {files.map(f => (
                  <li
                    key={f}
                    class="flex items-center gap-2 border-b border-base px-3 py-1.5 text-sm transition-colors last:border-b-0 hover:bg-active"
                  >
                    <span class="i-ph-file-duotone shrink-0 color-muted" />
                    <span class="truncate font-mono">{f}</span>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </section>
  )
}
