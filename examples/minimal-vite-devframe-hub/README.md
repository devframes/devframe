# Minimal Vite Devframe Hub

A protocol-witness example. The `src/minimal-vite-devframe-hub.ts` file is the entire Vite host — about 120 lines of Vite plugin code that wires `@devframes/hub` into a Vite dev server. Every framework's Devframe Hub host follows the same shape.

## Run it

```sh
pnpm install
pnpm --filter minimal-vite-devframe-hub dev
```

Open the printed URL. You should see:

- A status line showing the RPC backend
- A **Docks** list — one entry per `mountDevframe` call, plus the hub's built-in `~terminals` / `~messages` / `~settings` panels
- A **Commands** list — one entry per `commands.register()`
- A **Messages** list — populated via `messages.add()` on the server
- A **Terminals** list — empty unless a devframe registers one
- A button that exercises `hub:open-path` (opens this README in your editor)

## What the example proves

- `createHubContext()` boots a hub without any Vite-specific code path
- A `DevframeHost & HubHostCapabilities` impl plugs framework specifics (`openPath`, storage paths) into the hub uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock
- Hub built-in RPCs (`hub:open-path`, `hub:commands:execute`) work regardless of how the host was constructed
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the kit's `__connection.json` middleware

## Files

| File | Role |
|---|---|
| `src/minimal-vite-devframe-hub.ts` | The Vite plugin — creates hub context, mounts middleware, side-car WS |
| `src/devframe.ts` | A sample `DevframeDefinition` that plugs into the kit |
| `src/client/main.ts` | The browser-side UI that consumes the hub protocol |
| `index.html` | The UI shell |
