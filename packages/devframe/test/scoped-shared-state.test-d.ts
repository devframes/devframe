import type { DevframeScopedNodeRpc, DevframeServicesState } from 'devframe'
import type { DevframeScopedClientRpc } from 'devframe/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { expectTypeOf, it } from 'vitest'

interface MessageState {
  text: string
}

declare module 'devframe' {
  interface DevframeRpcSharedStates {
    [key: `test-messages:${string}`]: MessageState
  }
}

declare const node: DevframeScopedNodeRpc<'devframe'>
declare const client: DevframeScopedClientRpc<'devframe'>

it('infers the shared state type from a scoped string key', () => {
  expectTypeOf(node.sharedState('services')).resolves.toEqualTypeOf<SharedState<DevframeServicesState>>()
  expectTypeOf(client.sharedState('services')).resolves.toEqualTypeOf<SharedState<DevframeServicesState>>()

  // @ts-expect-error Scoped shared state keys must be strings.
  node.sharedState(123)
  // @ts-expect-error Scoped shared state keys must be strings.
  client.sharedState(Symbol('services'))
})

declare const messageNode: DevframeScopedNodeRpc<'test-messages'>
declare const messageClient: DevframeScopedClientRpc<'test-messages'>
declare const messageId: string

it('accepts only strings for a scoped state registered with a pattern key', () => {
  expectTypeOf(messageNode.sharedState(messageId)).resolves.toEqualTypeOf<SharedState<MessageState>>()
  expectTypeOf(messageClient.sharedState(messageId)).resolves.toEqualTypeOf<SharedState<MessageState>>()

  // @ts-expect-error A string index signature must not admit numeric arguments.
  messageNode.sharedState(123)
  // @ts-expect-error A string index signature must not admit numeric arguments.
  messageClient.sharedState(123)
})
