---
outline: deep
---

# Migrating to 0.7

0.7's one breaking change moves the `cac` CLI framework out of `devframe`'s bundled dependencies and renames the adapter that wraps it. This page covers the change between 0.6.x and 0.7.

## `cac` is now an optional peer dependency

`devframe` no longer depends on [`cac`](https://github.com/cacjs/cac) directly — it moved to an optional `peerDependency`. Any project that calls into the CLI adapter (formerly `createCli`, now `createCac`) needs to install `cac` itself:

```sh
npm install devframe cac
```

Tools that don't use the CLI adapter — a Vite-hosted plugin, an embedded devframe, anything built from the [lower-level factories](./standalone-cli#use-your-own-cli-framework) — are unaffected and never need `cac` installed.

## `devframe/adapters/cli` → `devframe/adapters/cac`

The adapter itself is renamed, and its factory with it:

| 0.6.x | 0.7 |
|-------|-----|
| `import { createCli } from 'devframe/adapters/cli'` | `import { createCac } from 'devframe/adapters/cac'` |
| `CreateCliOptions` | `CreateCacOptions` |
| `CliHandle` | `CacHandle` |

```ts
// 0.6.x
import { createCli } from 'devframe/adapters/cli'

await createCli(devframe).parse()
```

```ts
// 0.7
import { createCac } from 'devframe/adapters/cac'

await createCac(devframe).parse()
```

`devframe/adapters/cli` still exports `createCli` as a deprecated alias of `createCac` (same for `CreateCliOptions` and `CliHandle`), so existing imports keep compiling — but the underlying `cac` peer dependency still needs installing per above, and the alias will be removed in a future major release. Move call sites over now rather than waiting for that removal.

See [CLI (cac)](/adapters/cac) for the full adapter reference.
