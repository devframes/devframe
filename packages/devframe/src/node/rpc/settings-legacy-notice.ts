import type { LegacySharedSettingsNotice } from '../settings-legacy-notice'
import { defineRpcFunction } from 'devframe'
import { dismissLegacySharedSettingsNotice, readLegacySharedSettingsNotice } from '../settings-legacy-notice'

/**
 * Built-in RPC functions behind the one-time shared-scope settings notice.
 * Registered automatically by `createHostContext`, so any viewer can render
 * the notice without the host exposing a settings UI of its own.
 */
export const BUILTIN_SETTINGS_RPC = [
  defineRpcFunction({
    name: 'devframe:settings:legacy-notice',
    type: 'query',
    jsonSerializable: true,
    setup: ctx => ({
      /**
       * Namespaces whose settings file predates the project/global split. An
       * empty list means there is nothing to tell the user, or they dismissed
       * the notice already.
       */
      async handler(): Promise<LegacySharedSettingsNotice> {
        return readLegacySharedSettingsNotice(ctx)
      },
    }),
  }),
  defineRpcFunction({
    name: 'devframe:settings:legacy-notice-dismiss',
    type: 'action',
    jsonSerializable: true,
    setup: ctx => ({
      /** Record the dismissal once per machine, in the global storage dir. */
      async handler(): Promise<void> {
        dismissLegacySharedSettingsNotice(ctx)
      },
    }),
  }),
] as const

declare module 'devframe/types' {
  interface DevframeRpcServerFunctions {
    'devframe:settings:legacy-notice': () => Promise<LegacySharedSettingsNotice>
    'devframe:settings:legacy-notice-dismiss': () => Promise<void>
  }
}
