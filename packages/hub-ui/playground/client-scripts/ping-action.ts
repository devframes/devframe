import type { DockClientScriptContext } from '@devframes/hub/client'

/**
 * The "Ping" action dock's client script - `seed.ts` points its `action`
 * entry at this file's dev URL (served straight from the playground's own
 * Vite root, no build). Actions re-run their script on every click (see
 * `executeSetupScript`), so each click posts a fresh message.
 *
 * `messages.add` writes over the hub's built-in `hub:messages:add` RPC (it
 * always exists), so this succeeds - but nothing renders it: the message
 * feed / toasts read back through `devframes:plugin:messages:list`, which
 * only `@devframes/plugin-messages` registers, and this playground doesn't
 * mount it (its SPA needs a build, which would need this very package's own
 * dist - see `hub-plugin.ts`'s doc comment). Confirm a click ran by watching
 * the network tab for `client-scripts/ping-action.ts`, or breakpoint here.
 */
export default async function ping(context: DockClientScriptContext): Promise<void> {
  await context.messages.add({
    level: 'success',
    message: 'Pong!',
    description: 'The "Ping" action dock ran its client script just now.',
  })
}
