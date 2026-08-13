import { defineHandler } from 'nitro'

// The host app: any page becomes devtools-equipped with one dev-only script
// tag - the floating dock mounts itself and connects through the namespace
// the __devframes routes serve.
export default defineHandler(() => new Response(
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nitro Devframe Hub</title>
  </head>
  <body style="font-family: system-ui; padding: 2rem">
    <h1>Nitro Devframe Hub</h1>
    <p>This page is the host app. The devtools ride along:</p>
    <ul>
      <li>the floating dock (bottom of this page) is <code>/__devframes/embedded.js</code></li>
      <li>the standalone viewer lives at <a href="/__devframes/">/__devframes/</a></li>
      <li>discovery: <a href="/__devframes/__index.json">__index.json</a> · <a href="/__devframes/__connection.json">__connection.json</a></li>
    </ul>
    <script type="module" src="/__devframes/embedded.js"></script>
  </body>
</html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } },
))
