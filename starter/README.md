# devframe-starter

Self-contained starter for a single [devframe](https://github.com/devframes/devframe): a vanilla-TS Vite client, a CLI (dev/build/MCP), single + hub playgrounds, and unit + e2e tests. Copy this folder out of the monorepo as the seed for a new devframe - it pins real dependency versions (no `catalog:`/`workspace:*`) so it installs standalone.

## Run

```sh
pnpm install
pnpm run build         # build the vanilla-TS SPA into dist/client
pnpm run dev            # CLI dev server - http://localhost:7391/__devframe-starter/
pnpm run cli:build      # static deploy in ./dist/static
pnpm run play:single    # Vite playground: SPA at /, RPC bridge at /__devframe-starter/
pnpm run play:hub       # Vite playground: mounted as a dock inside a hub
pnpm run test           # unit tests (vitest)
pnpm run test:e2e       # e2e tests (playwright, against the single playground)
pnpm run lint
pnpm run typecheck
```

`pnpm run dev` and both playgrounds gate by default: opening the printed URL walks you through devframe's interactive OTP handshake (a 6-digit code) before the SPA can call RPC. That's intentional - see the `auth` comments in `src/devframe.ts` and `playground/*/vite.config.ts` before reaching for `auth: false`, which trusts every connection that can reach the port. For a one-off loopback-only session, pass `--no-auth` to the CLI instead (`pnpm run dev -- --no-auth`).

The `get-state` RPC carries an `agent` field, so the same function serves two views: the SPA for you, and an MCP tool for your coding agent. The dev server mounts the MCP route automatically at `<base>__mcp` (`@modelcontextprotocol/server` in the dependencies is what powers it), and `pnpm run dev -- mcp` serves the same tools over stdio.

## File map

| Path | Purpose |
|------|---------|
| `src/devframe.ts` | The single `DevframeDefinition` every surface below consumes. |
| `src/rpc/` | The one RPC function (`get-state` - a query+snapshot returning runtime info and a directory listing) and its namespace declaration. |
| `src/client/` | The vanilla-TS SPA: `index.html`, `main.ts`, `app.ts`, `styles.css`. |
| `src/shared/base-path.ts` | The devframe's base path, shared between the node-side definition and browser-side client entries. |
| `bin.mjs` | `createCac(devframe).parse()` - exposes `dev`, `build`, `mcp`. |
| `playground/single/` | Vite dev-serves the SPA (with HMR) while `devframeViteBridge` answers RPC/discovery at the devframe's own base - see the comment in its `vite.config.ts` for why the two can't share one base. |
| `playground/hub/` | A minimal hub (`@devframes/hub`) that mounts this devframe as an iframe dock (requires `pnpm run build` first). |
| `test/` | Unit tests - RPC functions over a real WebSocket, no browser. |
| `e2e/` | Playwright tests against the single playground, using the checked-in `e2e/fixtures/` directory as a fixed working directory. |

## Versioning

Dependencies here are real semver ranges, not the monorepo's pnpm catalog - so this folder is copy-paste ready outside the workspace. When developed in-repo, pnpm links `devframe`/`@devframes/*` to the local workspace packages automatically. See the root `AGENTS.md`'s `starter/` note for how a repo-wide `bumpp -r` release keeps these versions in sync.
