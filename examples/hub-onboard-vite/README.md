# hub-onboard-vite

A Vite host that ships only `@devframes/hub-ui-onboard` (about 20 kB in the browser) and installs the hub when the user asks for it.

```sh
pnpm --filter hub-onboard-vite dev
```

Open the printed URL. The button at the bottom left opens a panel with two actions:

- Install runs `pnpm add -D @devframes/hub @devframes/hub-ui @devframes/plugin-git` in this directory. When it finishes, the host starts the real hub on `/__devframes/` in the same process and the button swaps itself for the floating dock.
- Disable writes `node_modules/.devframe/hub-ui-onboard.json`. The host reads `onboarding.disabled` on the next start and injects no script.

Install changes this example's `package.json` and the lockfile. Run `git checkout -- examples/hub-onboard-vite pnpm-lock.yaml` and delete the state file to reset the demo.

## How it works

[`vite.config.ts`](./vite.config.ts) holds the whole integration:

- `createOnboarding({ packages, branding, onInstalled })` returns `nodeMiddleware`, `scriptSrc` and `disabled`.
- `server.middlewares.use(onboarding.nodeMiddleware)` serves `/__devframes/embedded.js` and the `/__devframes/__onboard/*` routes.
- `transformIndexHtml` injects `<script type="module" src="/__devframes/embedded.js">` unless the user disabled it earlier.
- `onInstalled` resolves the new packages from the project root, calls `initHub` with Vite's HTTP server, and returns `hub.handler`. From then on every request under the base goes to the hub.
