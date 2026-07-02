# storybook-hub

A devframe hub, built on `@devframes/hub`, that surfaces every built-in plugin's
Storybook as its own dock — plus the live terminals plugin running as a real
integration. It's a second take on the unified Storybook: instead of Storybook
Composition, the **hub** is the shell and each Storybook is a lazily-mounted
iframe dock (the same on-demand embed pattern the code-server plugin uses).

## How it works

The whole host is one Vite plugin (`src/storybook-hub.ts`): it creates a hub
context, implements the framework-neutral `DevframeHost`, registers a dock per
plugin Storybook, mounts the terminals plugin via `mountDevframe`, and starts a
side-car RPC/WS server.

Each Storybook dock's iframe is created **only when the dock is first opened**,
then kept mounted so its state survives tab switches. Where the iframe points
depends on the mode, unified behind the `storybook-hub:ensure` RPC:

- **dev** (`vite`) — the plugin's `storybook dev` server is spawned on first
  open and the dock iframes it live (HMR). The process is launched through
  `ctx.terminals`, the hub's terminals subsystem, so each spawned Storybook is
  a read-only terminal session — open the **Terminals** dock to watch its
  output stream live.
- **build** (`vite preview`) — the pre-built `storybook/storybook-static/<id>`
  is served by the hub on one origin and the dock iframes that.

## Run it

Build the plugin SPAs the hub mounts (terminals) once:

```sh
pnpm build
```

### Dev — Storybooks spawned on demand

```sh
pnpm --filter storybook-hub dev
```

Open the printed URL, then click a Storybook in the sidebar; its dev server
boots on first open (subsequent opens are instant). The dev servers listen on
their own ports, so reaching them from a remote browser needs those ports
forwarded.

### Preview — pre-built Storybooks on one origin

```sh
pnpm storybook:build            # produces storybook/storybook-static/<plugin>
pnpm --filter storybook-hub build
pnpm --filter storybook-hub preview
```

Everything is served from the single preview origin, so one forwarded port
reaches the whole hub.
