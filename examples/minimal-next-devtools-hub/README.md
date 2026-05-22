# Minimal Next DevTools Hub

A protocol-witness example. The `src/client/devtools/minimal-next-devtools-hub.ts` file wires `@devframes/hub` into a Next.js App Router app by lazily starting a side-car RPC/WS server from a Node route handler.

## Run it

```sh
pnpm install
pnpm --filter minimal-next-devtools-hub dev
```

Open the printed URL. You should see:

- A status line showing the RPC backend
- A **Docks** list with hub built-ins and the mounted demo devframe
- A **Commands** list populated from server-side registrations
- A **Messages** list populated via `messages.add()` on the server
- A **Terminals** list, empty unless a devframe registers one
- Buttons that exercise `hub:open-path` and `hub:commands:execute`

## What the example proves

- `createHubContext()` boots a hub without any Vite-specific code path
- A `DevToolsHost & HubHostCapabilities` impl plugs Next host specifics into the hub uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock
- Hub built-in RPCs (`hub:open-path`, `hub:commands:execute`) work regardless of how the host was constructed
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the Next route handler at `/__hub/__connection.json`

## Files

| File | Role |
|---|---|
| `src/client/devtools/minimal-next-devtools-hub.ts` | The Next host — creates hub context and side-car WS |
| `src/client/app/%5F_hub/%5F_connection.json/route.ts` | Connection-meta endpoint for `/__hub/__connection.json` that starts the singleton host |
| `src/client/devtools/demo-devframe.ts` | A sample `DevframeDefinition` that plugs into the host |
| `src/client/app/page.tsx` | The browser-side UI that consumes the hub protocol |
