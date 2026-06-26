---
outline: deep
---

# Examples

End-to-end examples that exercise the full adapter surface, each a runnable app in the repository. Like the [built-in plugins](/plugins/), they are written across different UI frameworks on purpose: the node-side definition stays the same while the browser bundle varies, so the set demonstrates that devframe is framework-agnostic at both the plugin and the host level.

| Example | UI framework | What it shows |
|---------|--------------|---------------|
| [files-inspector](./files-inspector) | Preact | Lists files in the cwd via RPC; exercises the CLI dev / build / spa surfaces. |
| [streaming-chat](./streaming-chat) | Preact | Streams synthetic chat tokens server → client, with history kept in shared state. |
| [next-runtime-snapshot](./next-runtime-snapshot) | React (Next.js) | A Next.js App Router SPA over RPC, surfacing the host Node runtime. |
| [minimal-vite-devframe-hub](./minimal-vite-devframe-hub) | Vanilla TypeScript (Vite) | A ~120-line Vite host wiring `@devframes/hub` end to end. |
| [minimal-next-devframe-hub](./minimal-next-devframe-hub) | React (Next.js) | The same hub protocol, hosted from a Next.js route handler. |

## Two kinds of example

The first three are **single-tool devframes** — one `DevframeDefinition` deployed through the [adapters](/adapters/), showing how RPC, streaming, and a chosen SPA framework fit together.

The last two are **hub hosts** built on [`@devframes/hub`](/guide/hub). They are protocol witnesses: each is a small host that exercises every hub subsystem (docks, commands, messages, terminals) so you can read one file and see the whole shape. One is a Vite plugin; the other a Next.js route handler — same hub, different host runtime.

## Run any example

Each example ships its own scripts; from the repository root:

```sh
pnpm install
pnpm --filter <example-name> dev
```

See the individual pages for the package name, the build / static-deploy commands, and what to look for in the running app.
