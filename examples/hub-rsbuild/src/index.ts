// The host app is deliberately trivial - the devtools ride along via the
// injected `/__devframes/embedded.js` script (see rsbuild.config.ts). The
// floating dock mounts itself; the standalone hub UI lives at /__devframes/.
const app = document.querySelector('#root') ?? document.body
app.innerHTML = `
  <div style="font-family: system-ui; padding: 2rem">
    <h1>Hub Rsbuild (minimal)</h1>
    <p>This page is the host app. The devtools ride along:</p>
    <ul>
      <li>the floating dock (bottom of this page) is <code>/__devframes/embedded.js</code></li>
      <li>the standalone hub UI lives at <a href="/__devframes/">/__devframes/</a></li>
      <li>discovery: <a href="/__devframes/__index.json">__index.json</a> · <a href="/__devframes/__connection.json">__connection.json</a></li>
    </ul>
  </div>
`
