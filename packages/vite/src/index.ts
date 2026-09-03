// `@devframes/vite` has no root export; it splits into two clearly-scoped
// subpaths so a consumer picks the job they're doing:
//
//   • `@devframes/vite/single` builds & dev-serves a SINGLE devframe's SPA
//     with Vite (the `devframeVitePlugin` / `devframeViteBridge` / `devframeVite`
//     plugins).
//   • `@devframes/vite/hub`    mounts a whole devframes-hub (many
//     integrations) inside a Vite dev server, `@devframes/hub-ui` by default.
//
// Importing the bare package is almost always a mistake, so it throws with
// the pointer above instead of silently resolving to nothing.
throw new Error(
  '[@devframes/vite] has no root export. Import from a scoped subpath instead:\n'
  + '  • "@devframes/vite/single": dev-serve one devframe\'s SPA with Vite\n'
  + '  • "@devframes/vite/hub": mount a devframes-hub inside a Vite app\n',
)
