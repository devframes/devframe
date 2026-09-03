# @devframes/storybook

The unified Storybook host, built as a **hub** on `@devframes/hub`: `@devframes/hub-ui` supplies the UI and each built-in devframe's Storybook is its own dock,
alongside the live terminals devframe running as a real mounted devframe.

## How it works

The whole host-framework integration is one Vite plugin (`src/hub.ts`): one `initHub()` call mounts
the terminals devframe (via the `devframes` list) and, in its `configure(ctx)`
step, registers a launcher dock (and a bound command) per built-in devframe's Storybook,
all behind the hub's connect middleware on a side-car RPC/WS server.

Each Storybook dock is a `type: 'launcher'` tile with a **Start** button, the
lazy trigger. The button binds a `ctx.commands` command (`storybook:launch:<id>`),
so the client dispatches it over the serializable `hub:commands:execute` path.
Once launched, the tile swaps in place for the running Storybook's iframe, kept
mounted so its state survives tab switches. Where the iframe points depends on
the mode:

- **dev** (`vite`): the launch command spawns the devframe's `storybook dev`
  through `ctx.terminals`, the hub's terminals subsystem, so each Storybook is a
  read-only terminal session (open the **Terminals** dock to watch its output
  stream live). As it boots, the tail of that output is patched onto the
  launcher's `digest`; on ready the command returns the live dev-server URL the
  client iframes (HMR).
- **build** (`vite preview`): the launch resolves immediately to the pre-built
  `storybook-static/<id>` the hub serves on one origin.

## Run it

Build the devframe SPAs the hub mounts (terminals) once:

```sh
pnpm build
```

### Dev: Storybooks spawned on demand

```sh
pnpm storybook
```

Open the printed URL, pick a Storybook in the sidebar, and hit **Start**; its
dev server boots on demand (subsequent opens are instant). The dev servers
listen on their own ports, so reaching them from a remote browser needs those
ports forwarded.

### Preview: pre-built Storybooks on one origin

```sh
pnpm storybook:build                       # produces storybook-static/<id>
pnpm --filter @devframes/storybook build    # builds the hub UI → dist/
pnpm --filter @devframes/storybook preview
```

Everything is served from the single preview origin, so one forwarded port
reaches the whole hub.
