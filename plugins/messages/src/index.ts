import type { DevframeDefinition } from 'devframe/types'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { DEFAULT_PORT, PLUGIN_ID } from './constants'
import { setupMessages } from './node/index'

// The Vue SPA is built (by Vite) into `dist/spa`. From both the source
// entry (`src/index.ts`, via the workspace alias) and the published
// entry (`dist/index.mjs`), `../dist/spa` resolves to `<pkg>/dist/spa`.
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

export interface MessagesDevframeOptions {
  /** Override the devframe id (and default CLI command / mount path). */
  id?: string
  /** Override the display name shown in a host dock. */
  name?: string
  /** Override the dock icon. */
  icon?: string
  /**
   * Override the mount path. Left unset, the SPA mounts at `/` standalone
   * and `/__<id>/` when hosted (Vite/embedded).
   */
  basePath?: string
  /** Preferred standalone CLI port. */
  port?: number
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — `--open` embeds the current OTP in the opened URL, so the
   * tab authenticates automatically without extra prompts. Hosted adapters
   * manage their own auth and ignore this.
   */
  auth?: boolean
}

/**
 * Build a {@link DevframeDefinition} for the hub message feed panel —
 * a portable view over `ctx.messages`, ported from vitejs/devtools'
 * built-in Messages view. The same definition runs standalone
 * (`/cli`, `/spa`, `/build`) and mounts into a host (`/vite`, hub);
 * a hub host is what feeds it live entries.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createMessagesDevframe(options: MessagesDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? PLUGIN_ID
  return defineDevframe({
    id,
    name: options.name ?? 'Messages',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:notification-duotone',
    basePath: options.basePath,
    cli: {
      command: id,
      port: options.port ?? DEFAULT_PORT,
      distDir: existsSync(distDir) ? distDir : undefined,
      // Gate the standalone server by default; `maybeOpenBrowser` folds the
      // current OTP into the `--open` URL so the tab lands already trusted.
      // Hosted adapters (Vite/hub) supply their own auth layer and ignore this.
      auth: options.auth ?? true,
    },
    dock: {
      category: '~builtin',
    },
    spa: { loader: 'none' },
    setup(ctx) {
      setupMessages(ctx)
    },
  })
}

/** The default messages devframe definition. */
const messagesDevframe: DevframeDefinition = createMessagesDevframe()

export default messagesDevframe
export { DEFAULT_PORT, MESSAGES_UPDATED_EVENT, PLUGIN_ID } from './constants'
// The plugin's data vocabulary is the hub's — re-exported so the SPA, the
// embeddable client, and consumers can type against the plugin package alone.
export type {
  DevframeMessageEntry,
  DevframeMessageEntryFrom,
  DevframeMessageEntryInput,
  DevframeMessageLevel,
  DevframeMessagesListDelta,
} from '@devframes/hub/types'
