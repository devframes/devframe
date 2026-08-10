export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div>
      <h1>Hub Next (minimal)</h1>
      <p>This page is the host app. The devtools ride along:</p>
      <ul>
        <li>
          the floating dock (bottom of this page) is
          {' '}
          <code>/__devframes/embedded.js</code>
        </li>
        <li>
          the standalone viewer lives at
          {' '}
          <a href="/__devframes/">/__devframes/</a>
        </li>
        <li>
          discovery:
          {' '}
          <a href="/__devframes/__index.json">__index.json</a>
          {' · '}
          <a href="/__devframes/__connection.json">__connection.json</a>
        </li>
      </ul>
    </div>
  )
}
