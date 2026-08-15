# `@devframes/plugin-assets`

Browse, preview, upload, rename, and delete the files in a directory — a framework-neutral port of Nuxt DevTools' Assets tab, built as a **Vue** SPA on `@antfu/design`.

```sh
pnpx @devframes/plugin-assets
```

Manages `<cwd>/public` by default. The package exports `createAssetsDevframe()` for custom definitions — mount it into a Vite host with `devframeVite()` from `@devframes/vite/dev-spa`. Pass `{ dir }` to manage a different directory, `{ baseURL }` to match where the host serves it, or `{ write: false }` (`--read-only` on the standalone CLI) for a browse-only deployment.

Asset previews load files by their public URL, served by the host the plugin is mounted into (Vite/Nuxt/etc. already serve `public/` at `/`) — the plugin doesn't serve the bytes itself. The standalone CLI is its own host, so it serves the directory for you.

The standalone server requires devframe's trust handshake by default because it can read, write, and delete real files. The `build` CLI subcommand is disabled by default — see the docs page for why.
