# Devframe

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

Framework-neutral foundation for building generic DevTools. Describe one devframe — its RPC, its data, its SPA, its CLI shape — and deploy the same definition through any of seven adapters.

Documentation: [https://devfra.me/](https://devfra.me/).

## Install

```sh
pnpm add devframe
```

## Hello, Devframe

```ts
import { defineDevframe, defineRpcFunction } from 'devframe'
import { createCli } from 'devframe/adapters/cli'

const devframe = defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
      name: 'my-devframe:hello',
      type: 'static',
      jsonSerializable: true,
      handler: () => ({ message: 'hello' }),
    }))
  },
})

await createCli(devframe).parse()
```

## Adapters

| Adapter | Use case |
|---------|----------|
| `cli` | Standalone CLI tool with `dev` / `build` / `mcp` subcommands. |
| `build` | Generates a static, self-contained SPA snapshot. |
| `vite` | Runs as a Vite plugin alongside the host app's dev server. |
| `kit` | Mounts into a DevTools Kit aggregator (e.g. `@vitejs/devtools-kit`). |
| `embedded` | Overlays inside another devframe's UI. |
| `mcp` | Surfaces the devframe's RPC to coding agents over MCP. |

## Repo layout

| Path | Description |
|------|-------------|
| [`packages/devframe`](./packages/devframe) | The published [`devframe`](https://www.npmjs.com/package/devframe) npm package. |
| [`packages/nuxt`](./packages/nuxt) | The [`@devframes/nuxt`](https://www.npmjs.com/package/@devframes/nuxt) Nuxt module adapter. |
| [`docs`](./docs) | VitePress documentation site, deployed at https://devfra.me/. |
| [`examples`](./examples) | End-to-end demos: [`devframe-counter`](./examples/devframe-counter), [`devframe-files-inspector`](./examples/devframe-files-inspector), and [`devframe-streaming-chat`](./examples/devframe-streaming-chat). |
| [`tests`](./tests) | Public-API snapshot tests via [`tsnapi`](https://github.com/posva/tsnapi). |

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg" alt="Sponsors"/>
  </a>
</p>

## License

[MIT](./LICENSE.md) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/devframe?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/devframe
[npm-downloads-src]: https://img.shields.io/npm/dm/devframe?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmx.dev/package/devframe
[bundle-src]: https://img.shields.io/bundlephobia/minzip/devframe?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=devframe
[license-src]: https://img.shields.io/github/license/devframes/devframe.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/devframes/devframe/blob/main/LICENSE.md
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/devframe
