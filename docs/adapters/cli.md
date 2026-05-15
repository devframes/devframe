---
outline: deep
---

# CLI

The CLI adapter wraps a `DevframeDefinition` in a `cac`-powered command-line interface. From one entry it spins up an `h3` dev server with WebSocket RPC, builds static snapshots, builds SPA bundles, or starts an MCP server.

```ts
import { defineDevframe } from 'devframe'
import { createCli } from 'devframe/adapters/cli'

const devframe = defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  cli: { distDir: './client/dist' },
  setup(ctx) { /* register docks, RPC, etc. */ },
})

await createCli(devframe).parse()
```

Running the resulting binary:

```sh
my-devframe                     # dev server at http://localhost:9999/
my-devframe --port 8080
my-devframe build --out-dir dist-static
my-devframe build --out-dir dist-static --base /devtools/
my-devframe mcp                 # stdio MCP server (experimental)
```

Standalone CLI serves the SPA at `/` by default. The `/__devtools/` prefix is for *hosted* adapters where devframe mounts alongside an existing app — see [Mount paths](./#mount-paths).

## Options

`createCli(def, options?)` accepts:

| Option | Default | Description |
|--------|---------|-------------|
| `defaultPort` | `9999` (or `def.cli?.port`) | Port used by the dev command when `--port` isn't provided. |
| `configureCli` | — | `(cli: CAC) => void` — final hook to add commands/flags at the assembly stage, after the definition's `cli.configure` runs. |
| `onReady` | — | `(info: { origin, port, app }) => void \| Promise<void>` — called once the dev server is listening. Use this to print your own startup banner. |

`createCli` returns a `CliHandle`:

```ts
interface CliHandle {
  cli: CAC // raw cac instance — mutate before calling parse()
  parse: (argv?: string[]) => Promise<void>
}
```

The `cli` property lets the caller add ad-hoc commands and flags right before `parse()` when a `configureCli` callback is inconvenient.

## Definition-level `cli` fields

```ts
defineDevframe({
  id: 'my-devframe',
  cli: {
    command: 'my-devframe', // binary name; default: the id
    distDir: './client/dist', // required for dev/build/spa
    port: 7777, // preferred port
    portRange: [7777, 9000], // passed through to get-port-please
    random: false, // passed through to get-port-please
    host: '127.0.0.1', // default host; --host overrides
    open: true, // auto-open the browser on dev start
    auth: false, // skip the trust handshake (single-user localhost)
    configure(cli) { // contribute capability flags/commands
      cli.option('--config <file>', 'Custom config file')
        .option('--no-files', 'Skip file matching')
    },
  },
  setup(ctx, { flags }) {
    // `flags` is the parsed cac flag bag — includes both devframe's
    // built-ins (`--port`, `--host`, `--open`) and anything declared in
    // `cli.configure` or `configureCli`.
  },
})
```

`distDir` is the only required field; everything else has sensible defaults. The `configure` hook runs *before* the `configureCli` option passed to `createCli`, so the final tool author always has the last word on flags.

## Headless logging

Devframe leaves startup output to the application. Wire `onReady` to print your own banner:

```ts
await createCli(devframe, {
  onReady({ origin }) {
    console.log(`ESLint Config Inspector ready at ${origin}`)
  },
}).parse()
```

Structured diagnostics (via `nostics`) continue to surface through their normal reporters.

## Use your own CLI framework

To integrate devframe into an existing commander / yargs program — or to expose a different command structure than `createCli`'s `dev` / `build` / `mcp` triplet — drop down to the peer factories. Same `DevframeDefinition`, different shell:

| Building block | Entry | Purpose |
|----------------|-------|---------|
| [`createDevServer(def, opts?)`](./dev) | `devframe/adapters/dev` | h3 + WebSocket RPC + SPA mount |
| [`createBuild(def, opts?)`](./build) | `devframe/adapters/build` | Static deploy |
| [`createMcpServer(def, opts?)`](./mcp) | `devframe/adapters/mcp` | stdio MCP server |
| `parseCliFlags(schema, raw)` | `devframe/adapters/cli` | Validate a flag bag against a `CliFlagsSchema` |

See the [Standalone CLI guide](/guide/standalone-cli#use-your-own-cli-framework) for a worked commander example.
