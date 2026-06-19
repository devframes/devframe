import type { InspectorCtx } from '../app'
import { useEffect, useState } from 'preact/hooks'

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
    <section>
      <h2>
        Files
        {' '}
        <small>
          (
          {files.length}
          )
        </small>
      </h2>
      <button onClick={refresh} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      <ul>
        {files.map(f => <li key={f}>{f}</li>)}
      </ul>
    </section>
  )
}
