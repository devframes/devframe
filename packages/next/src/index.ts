// `@devframes/next` has no root export — it splits into two clearly-scoped
// subpaths so a consumer picks the job they're doing:
//
//   • `@devframes/next/dev-spa`        — host a SINGLE devframe's SPA in a
//     Next.js App Router app (`withDevframe`, `createDevframeNextHandler`),
//     with its React client at `@devframes/next/dev-spa/client`.
//   • `@devframes/next/hub`            — mount a whole devframes-hub (many
//     integrations) from one catch-all route, `@devframes/hub-ui` by default,
//     with a React client helper at `@devframes/next/hub/client`.
//
// Importing the bare package is almost always a mistake, so it throws with
// the pointer above instead of silently resolving to nothing.
throw new Error(
  '[@devframes/next] has no root export. Import from a scoped subpath instead:\n'
  + '  • "@devframes/next/dev-spa" (+ "/dev-spa/client") — host one devframe\'s SPA\n'
  + '  • "@devframes/next/hub" (+ "/hub/client")         — mount a devframes-hub\n',
)
