---
outline: deep
---

# Examples

End-to-end examples that exercise the full adapter surface, each a runnable app in the repository. Like the [built-in plugins](/plugins/), they are written across different UI frameworks on purpose: the node-side definition stays the same while the browser bundle varies, so the set demonstrates that devframe is framework-agnostic at both the plugin and the host level.

| Example | UI framework | What it shows |
|---------|--------------|---------------|
| [files-inspector](./files-inspector) | Preact | Lists files in the cwd via RPC; exercises the CLI dev / build surfaces. |
| [json-render](./json-render) | Vue | A server-authored JSON-render view rendered by `@devframes/json-render-ui`, with live state and an action bridge. |
| [streaming-chat](./streaming-chat) | Preact | Streams synthetic chat tokens server → client, with history kept in shared state. |
| [next-runtime-snapshot](./next-runtime-snapshot) | React (Next.js) | A Next.js App Router SPA over RPC, surfacing the host Node runtime. |
| [hub-vite](./hub-vite) | Vanilla TypeScript (Vite) | A ~120-line Vite host wiring `@devframes/hub` end to end, with a hand-built viewer. |
| [hub-next](./hub-next) | React (Next.js) | The same hub protocol and hand-built viewer, hosted from a Next.js route handler. |

The **minimal** family instead mounts one `initHub({ ui: createUi() })` handler and lets `@devframes/hub-ui` supply the viewer — the same integration across frameworks, no hand-built UI:

| Example | Host | What it shows |
|---------|------|---------------|
| [hub-vite-minimal](./hub-vite-minimal) | Vite | The hub handler on Vite's dev middleware. |
| [hub-next-minimal](./hub-next-minimal) | Next.js | The hub handler on an App Router catch-all route. |
| [hub-nitro-minimal](./hub-nitro-minimal) | Nitro | The hub handler on a Nitro catch-all route. |
| [hub-hono-minimal](./hub-hono-minimal) | Hono | The hub handler on Hono, running on Node and Bun. |
| [hub-rsbuild-minimal](./hub-rsbuild-minimal) | Rsbuild | The hub handler on Rsbuild's dev middleware. |

## Run any example

Each example ships its own scripts; from the repository root:

```sh
pnpm install
pnpm --filter <example-name> dev
```

See the individual pages for the package name, the build / static-deploy commands, and what to look for in the running app.
