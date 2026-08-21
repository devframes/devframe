---
outline: deep
---

# CLI (cac)

Wraps a `DevframeDefinition` in a [`cac`](https://github.com/cacjs/cac)-powered CLI with `dev`, `build`, and `mcp` commands.

`cac` is an optional peer of this adapter:

```sh
npm install devframe cac
```

Tools using the [lower-level factories](#use-your-own-cli-framework) need no `cac`.

```ts
import { defineDevframe } from 'devframe'
import { createCac } from 'devframe/adapters/cac'

const devframe = defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  clientAssets: './client/dist',
  setup(ctx) { /* register docks, RPC, etc. */ },
})

await createCac(devframe).parse()
```

Running the binary:

```sh
my-devframe                     # dev server at http://localhost:9999/
my-devframe --port 8080
my-devframe build --out-dir dist-static
my-devframe build --out-dir dist-static --base /devframe/
my-devframe mcp                 # stdio MCP server
```

The SPA serves at `/` standalone, `/__devframe/` when hosted ([Mount paths](./#mount-paths)).

## Options

`createCac(def, options?)`:

| Option | Default | Description |
|--------|---------|-------------|
| `defaultPort` | `9999` (or `def.cli?.port`) | Dev port if `--port` unset. |
| `configureCli` | — | `(cli: CAC) => void` — add commands/flags post-`cli.configure`. |
| `onReady` | — | `(info: { origin, port, app }) => void \| Promise<void>` — once listening. |

`createCac` returns a `CacHandle`:

```ts
interface CacHandle {
  cli: CAC // raw cac instance — mutate before calling parse()
  parse: (argv?: string[]) => Promise<void>
}
```

Add commands/flags via `cli` before `parse()`.

## Definition-level `cli` fields

```ts
defineDevframe({
  id: 'my-devframe',
  clientAssets: './client/dist', // built SPA served as the UI
  cli: {
    command: 'my-devframe', // binary name; default: the id
    port: 7777, // preferred port
    portRange: [7777, 9000], // passed through to get-port-please
    random: false, // passed through to get-port-please
    host: '127.0.0.1', // default host; --host overrides
    open: true, // auto-open the browser on dev start; embeds the current OTP so the tab lands authenticated
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

`configure` runs *before* `createCac`'s `configureCli`.

## Headless logging

Wire `onReady` to print a banner:

```ts
await createCac(devframe, {
  onReady({ origin }) {
    console.log(`ESLint Config Inspector ready at ${origin}`)
  },
}).parse()
```

## Use your own CLI framework

Drop to the peer factories for a commander/yargs program or other structure:

| Building block | Entry | Purpose |
|----------------|-------|---------|
| [`createDevServer()`](./dev) | `devframe/adapters/dev` | h3 + WebSocket RPC + SPA mount |
| [`createBuild()`](./build) | `devframe/adapters/build` | Static deploy |
| [`createMcpServer()`](./mcp) | `devframe/adapters/mcp` | stdio MCP server |
| `parseCliFlags(schema, raw)` | `devframe/adapters/cac` | Validate flags (`CliFlagsSchema`) |

See the [Standalone CLI guide](/guide/standalone-cli#use-your-own-cli-framework).
