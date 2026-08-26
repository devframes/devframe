import type { HubInstance } from '@devframes/hub/initiate'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createA11yDevframe } from '@devframes/plugin-a11y'
import { createAssetsDevframe } from '@devframes/plugin-assets'
import { createCodeServerDevframe } from '@devframes/plugin-code-server'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { createGitDevframe } from '@devframes/plugin-git'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { createOgDevframe } from '@devframes/plugin-og'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

// One `initHub` call, memoized on globalThis so SvelteKit's dev-time module
// reload returns the live hub instead of leaking transports. The RPC socket
// runs on a side-car port advertised via __connection.json: SvelteKit's
// `+server.ts` handlers hand over `Request`s and never see WebSocket
// upgrades, so `ws.sidecar` asks for a socket of its own — the browser client
// discovers it automatically.
const globalRef = globalThis as { __hubSvelteKitMinimal?: HubInstance }

export const hub: HubInstance = globalRef.__hubSvelteKitMinimal ??= initHub({
  base: DEVFRAMES_HUB_BASE,
  ws: { sidecar: true },
  // Every built-in plugin, dogfooded end to end through the hub mount path.
  // `data-inspector`'s default id carries `:` (a route-param marker), so it
  // gets a colon-free id override to be a valid `<base><id>/` segment; the
  // assets watcher is off since this host demonstrates mounting, not authoring.
  devframes: [
    createGitDevframe(),
    createTerminalsDevframe(),
    createCodeServerDevframe(),
    createInspectDevframe(),
    createDataInspectorDevframe({ id: 'devframes_plugin_data-inspector' }),
    createA11yDevframe(),
    createMessagesDevframe(),
    createOgDevframe(),
    createAssetsDevframe({ watch: false }),
  ],
  // Rebrand the reference UI to Svelte's own orange — one field, no CSS:
  // `createUi`'s `branding` option publishes `ConnectionMeta.configs.ui.branding`,
  // which the dock reads at connect time and feeds into `--devframe-primary`
  // (see `@devframes/hub-ui`'s `primary-ramp.css`).
  ui: createUi({ branding: { primaryColor: '#ff3e00', productName: 'Devframes on SvelteKit' } }),
  // Gate with devframe's interactive OTP (the default). The hub prints a
  // 6-digit code + magic link on startup, and the reference UI's authorization
  // view exchanges it for a bearer token. See docs/content/1.guide/15.security.md.
  configure(ctx) {
    ctx.commands.register({
      id: 'example:hub-sveltekit-minimal:ping',
      title: 'SvelteKit Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
  },
})
