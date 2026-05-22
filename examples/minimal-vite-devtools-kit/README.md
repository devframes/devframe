# Minimal Vite DevTools Kit

A protocol-witness example. The `src/minimal-hub-kit.ts` file is the entire "kit" — about 120 lines of Vite plugin code that wires `@devframes/hub` into a Vite dev server. Every framework's hub kit (`@vitejs/devtools-kit`, future `@next/devtools-kit`, etc.) is the same shape.

## Run it

```sh
pnpm install
pnpm --filter minimal-vite-devtools-kit-example dev
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
- A `DevToolsHost & HubHostCapabilities` impl plugs framework specifics (`openPath`, storage paths) into the hub uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock
- Hub built-in RPCs (`hub:open-path`, `hub:commands:execute`) work regardless of how the host was constructed
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the kit's `__connection.json` middleware

## Files

| File | Role |
|---|---|
| `src/minimal-hub-kit.ts` | The Vite plugin — creates hub context, mounts middleware, side-car WS |
| `src/devframe.ts` | A sample `DevframeDefinition` that plugs into the kit |
| `src/client/main.ts` | The browser-side UI that consumes the hub protocol |
| `index.html` | The UI shell |
