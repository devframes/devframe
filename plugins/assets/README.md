# `@devframes/plugin-assets`

Browse, preview, upload, rename, and delete the files in a directory — a framework-neutral port of Nuxt DevTools' Assets tab, built as a **Preact** SPA.

```sh
pnpx @devframes/plugin-assets
```

Manages `<cwd>/public` by default. The package exports `createAssetsDevframe()` for custom definitions and `assetsVitePlugin()` from `@devframes/plugin-assets/vite` for Vite hosts. Pass `{ dir }` to manage a different directory, or `{ write: false }` (`--read-only` on the standalone CLI) for a browse-only deployment.

The standalone server requires devframe's trust handshake by default because it can read, write, and delete real files. The `build` CLI subcommand is disabled by default — see the docs page for why.
