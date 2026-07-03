import type { DevframeMessagesHost as DevframeMessagesHostType } from '@devframes/hub/types'
import type { DevframeDefinition, DevframeNodeContext } from 'devframe/types'
import { defineDevframe } from 'devframe/types'
import { MESSAGES_UPDATED_EVENT } from '../constants'
import { createMessagesDevframe } from '../index'

/**
 * Dev-only self-host harness for `pnpm dev`. The plugin itself is headless
 * and reads whatever hub host it's mounted on; this harness stands in for a
 * hub by attaching a real `DevframeMessagesHost` to the plain devframe
 * context, wiring the change broadcast the way `createHubContext` does, and
 * seeding a lively demo feed. Production adapters never load this module —
 * the hub import stays lazy so loading the Vite config needs no hub build.
 */
export function createMessagesDevDevframe(): DevframeDefinition {
  const base = createMessagesDevframe()
  return defineDevframe({
    ...base,
    async setup(ctx) {
      const { DevframeMessagesHost } = await import('@devframes/hub/node')
      const messages = new DevframeMessagesHost(ctx as never)
      Object.assign(ctx, { messages })
      wireBroadcast(ctx, messages)
      await base.setup(ctx)
      seedDemoMessages(messages)
    },
  })
}

function wireBroadcast(ctx: DevframeNodeContext, messages: DevframeMessagesHostType): void {
  const broadcast = (): void => {
    ctx.rpc.broadcast({ method: MESSAGES_UPDATED_EVENT, args: [] })
  }
  messages.events.on('message:added', broadcast)
  messages.events.on('message:updated', broadcast)
  messages.events.on('message:removed', broadcast)
  messages.events.on('message:cleared', broadcast)
}

function seedDemoMessages(messages: DevframeMessagesHostType): void {
  void messages.add({
    level: 'success',
    message: 'Messages dev harness started',
    description: 'This feed is seeded demo data — a hub host feeds the real one.',
    category: 'demo',
  })
  void messages.add({
    level: 'info',
    message: 'HMR update applied',
    description: 'src/client/components/MessagesView.vue',
    category: 'build',
    labels: ['hmr', 'vite'],
  })
  void messages.add({
    level: 'warn',
    message: 'Image element missing alt attribute',
    description: 'Screen readers announce nothing useful for this image.',
    category: 'a11y',
    labels: ['axe', 'image-alt'],
    elementPosition: {
      selector: 'main > figure > img.hero',
      description: 'Hero image in the landing section',
      boundingBox: { x: 24, y: 180, width: 640, height: 360 },
    },
  })
  void messages.add({
    level: 'error',
    message: 'Unhandled promise rejection',
    description: 'TypeError: Cannot read properties of undefined (reading \'entries\')',
    category: 'runtime',
    labels: ['browser'],
    stacktrace: [
      'TypeError: Cannot read properties of undefined (reading \'entries\')',
      '    at refresh (src/client/state/messages.ts:42:18)',
      '    at async useMessages (src/client/state/messages.ts:80:5)',
    ].join('\n'),
    notify: true,
  })
  void messages.add({
    level: 'warn',
    message: 'Unused variable `delta`',
    description: '`delta` is declared but its value is never read.',
    category: 'lint',
    labels: ['eslint', 'unused-imports'],
    filePosition: { file: 'src/client/state/messages.ts', line: 42, column: 9 },
  })
  void messages.add({
    level: 'debug',
    message: 'WebSocket reconnected',
    description: 'Resumed the RPC channel after 1 missed heartbeat.',
    category: 'runtime',
  })

  // A loading entry that resolves — exercises the update path end to end.
  void messages.add({
    id: 'demo:typecheck',
    level: 'info',
    message: 'Typechecking project…',
    category: 'build',
    labels: ['tsc'],
    status: 'loading',
  })
  setTimeout(() => {
    void messages.update('demo:typecheck', {
      level: 'success',
      message: 'Typecheck passed',
      description: '0 errors, 0 warnings in 214 files.',
      status: 'idle',
    })
  }, 4000)

  // A slow heartbeat with `autoDelete` — exercises removals + delta sync.
  let beat = 0
  setInterval(() => {
    beat += 1
    void messages.add({
      level: 'debug',
      message: `Heartbeat #${beat}`,
      description: 'Auto-deletes after 12s to exercise the removal delta.',
      category: 'demo',
      autoDelete: 12_000,
    })
  }, 15_000)
}
