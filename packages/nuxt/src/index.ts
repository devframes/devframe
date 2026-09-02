// `@devframes/nuxt` has no root export - it splits into two clearly-scoped
// subpaths so you pick the job you're doing:
//
//   • `@devframes/nuxt/single` - wire a Nuxt app up as a SINGLE devframe's
//     client (the Nuxt module + its dev-time RPC bridge).
//   • `@devframes/nuxt/hub`    - mount a whole devframes-hub (many
//     integrations) alongside `nuxt dev`, `@devframes/hub-ui` by default,
//     with a client composable at `@devframes/nuxt/hub/client`.
//
// Register the module by its subpath, e.g.
// `modules: ['@devframes/nuxt/single']`. Importing the bare package throws
// with the pointer above instead of silently resolving to nothing.
throw new Error(
  '[@devframes/nuxt] has no root export. Use a scoped subpath instead:\n'
  + '  • modules: ["@devframes/nuxt/single"] - Nuxt app as one devframe client\n'
  + '  • modules: ["@devframes/nuxt/hub"]    - mount a devframes-hub with nuxt dev\n',
)
