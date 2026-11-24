import type { DevframeScopedNodeRpc, DevframeServicesState } from 'devframe'
import type { DevframeScopedClientRpc } from 'devframe/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { expectTypeOf, it } from 'vitest'

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
