import type { AgentResourceVariables } from '../../../../types/agent'
import type { DevframeDefinition } from '../../../../types/devframe'
import { createMcpServer } from '../../build-server'

const definition: DevframeDefinition = {
  id: 'resource-stdio-test',
  name: 'Resource stdio test',
  version: '1.0.0',
  packageName: '@devframe/resource-stdio-test',
  homepage: 'https://example.com',
  description: 'Stdio resource test fixture.',
  async setup(ctx) {
    const state = await ctx.rpc.sharedState.get('stdio:counter', {
      initialValue: { count: 0 },
    })
    const fixed = ctx.agent.registerResource({
      id: 'status',
      uri: 'https://example.com/status',
      name: 'Status',
      read: () => ({ json: { status: 'ok' } }),
    })
    const ignored = ctx.agent.registerResource({
      id: 'ignored',
      name: 'Ignored',
      read: () => ({ json: { ignored: true } }),
    })
    const artifact = ctx.agent.registerResource({
      id: 'artifact',
      uriTemplate: 'devframe://resource/artifacts/{artifactId}',
      name: 'Artifact',
      read: (_uri: URL, variables: AgentResourceVariables) => ({ json: variables }),
    })
    ctx.agent.registerTool({
      id: 'increment-state',
      description: 'Increment the fixture state.',
      handler: () => {
        state.mutate(value => void (value.count += 1))
        fixed.notifyUpdated()
        artifact.notifyUpdated('devframe://resource/artifacts/42')
        ignored.notifyUpdated()
      },
    })
  },
}

await createMcpServer(definition, { transport: 'stdio' })
