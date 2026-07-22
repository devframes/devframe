import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import { fileURLToPath } from 'node:url'
import { createJsonRenderView } from '@devframes/json-render/node'
import { defineRpcFunction } from 'devframe'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { REFRESH_ACTION, VIEW_ID } from './shared.ts'

const BASE_PATH = '/__minimal-json-render/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

// A server-authored spec. Values marked `{ $state: '/...' }` resolve from the
// view's live state at render time, so patching state updates the UI without a
// whole-spec replacement.
const spec: DevframeJsonRenderSpec = {
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 14 }, children: ['title', 'card', 'actions'] },
    title: { type: 'Text', props: { text: 'JSON-render demo', variant: 'heading' }, children: [] },
    card: { type: 'Card', props: { title: 'Live metrics' }, children: ['metrics'] },
    metrics: { type: 'Stack', props: { gap: 8 }, children: ['uptimeRow', 'refreshRow'] },
    uptimeRow: { type: 'Stack', props: { direction: 'row', gap: 8 }, children: ['uptimeLabel', 'uptimeValue'] },
    uptimeLabel: { type: 'Text', props: { text: 'Uptime (s)', variant: 'caption' }, children: [] },
    uptimeValue: { type: 'Text', props: { text: { $state: '/uptime' }, variant: 'body' }, children: [] },
    refreshRow: { type: 'Stack', props: { direction: 'row', gap: 8 }, children: ['refreshLabel', 'refreshValue'] },
    refreshLabel: { type: 'Text', props: { text: 'Manual refreshes', variant: 'caption' }, children: [] },
    refreshValue: { type: 'Text', props: { text: { $state: '/refreshes' }, variant: 'body' }, children: [] },
    actions: { type: 'Stack', props: { direction: 'row', gap: 8 }, children: ['refresh'] },
    refresh: {
      type: 'Button',
      props: { label: 'Refresh', variant: 'primary', icon: 'arrow-clockwise' },
      on: { press: { action: REFRESH_ACTION } },
      children: [],
    },
  },
  state: { uptime: 0, refreshes: 0 },
}

export default defineDevframe({
  id: 'minimal-json-render',
  name: 'Minimal JSON-Render',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:layout-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'minimal-json-render',
    port: 9877,
    distDir,
    // Single-user localhost demo — skip the trust handshake so the served SPA
    // can call the action RPC without an OTP round-trip.
    auth: false,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    const view = createJsonRenderView(ctx, { id: VIEW_ID, spec })

    // The action bridge dispatches a spec action as an RPC call of the same
    // name. Register the handler for the Button's `press` action; it bumps a
    // counter and patches the view state (which broadcasts to the SPA).
    let refreshes = 0
    ctx.rpc.register(defineRpcFunction({
      name: REFRESH_ACTION,
      type: 'query',
      jsonSerializable: true,
      handler: () => {
        refreshes += 1
        view.patchState([{ op: 'replace', path: '/refreshes', value: refreshes }])
        return { refreshes }
      },
    }))

    // Live, server-driven state: tick uptime every second in dev. Unref the
    // timer so it never keeps a one-shot `build` run alive.
    if (ctx.mode === 'dev') {
      let uptime = 0
      const timer = setInterval(() => {
        uptime += 1
        view.patchState([{ op: 'replace', path: '/uptime', value: uptime }])
      }, 1000)
      timer.unref?.()
    }
  },
})
