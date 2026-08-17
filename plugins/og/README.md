# `@devframes/plugin-og`

Inspect Open Graph and Twitter metadata for any reachable page, then compare its social preview across Twitter, Facebook, LinkedIn, and Telegram.

```sh
pnpx @devframes/plugin-og
```

The package exports `createOgDevframe()` for custom definitions — mount it into a Vite host with `devframeVite()` from `@devframes/vite/single`. Pass `defaultUrl` to bake a shareable report with the devframe build adapter.
