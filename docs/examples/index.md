---
outline: deep
---

# Examples

Runnable apps in different UI frameworks over one node-side definition, like the [built-in plugins](/plugins/).

| Example | UI | Shows |
|---------|--------------|---------------|
| [files-inspector](./files-inspector) | Preact | Lists cwd files over RPC. |
| [json-render](./json-render) | Vue | Server-authored view via `@devframes/json-render-ui`; live state + action bridge. |
| [streaming-chat](./streaming-chat) | Preact | Streams tokens; history in shared state. |
| [next-runtime-snapshot](./next-runtime-snapshot) | React (Next.js) | App Router SPA surfacing the Node runtime. |
| [hub-vite](./hub-vite) | Vanilla TS (Vite) | ~120-line Vite host wiring `@devframes/hub`; hand-built viewer. |
| [hub-next](./hub-next) | React (Next.js) | Same protocol, Next.js route. |

The **minimal** family mounts `initHub({ ui: createUi() })` with `@devframes/hub-ui`:

| Example | Host | Shows |
|---------|------|---------------|
| [hub-vite-minimal](./hub-vite-minimal) | Vite | Dev middleware. |
| [hub-next-minimal](./hub-next-minimal) | Next.js | App Router route. |
| [hub-nitro-minimal](./hub-nitro-minimal) | Nitro | Catch-all route. |
| [hub-hono-minimal](./hub-hono-minimal) | Hono | Node and Bun. |
| [hub-fastify-minimal](./hub-fastify-minimal) | Fastify | `nodeMiddleware`. |
| [hub-sveltekit-minimal](./hub-sveltekit-minimal) | SvelteKit | Catch-all endpoint. |
| [hub-deno-minimal](./hub-deno-minimal) | Deno | `Deno.serve` + upgrade socket. |
| [hub-rsbuild-minimal](./hub-rsbuild-minimal) | Rsbuild | Dev middleware. |

## Run any example

```sh
pnpm install
pnpm --filter <example-name> dev
```

See each page for build commands.
