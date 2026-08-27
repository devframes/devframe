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
      read: uri => ({ json: { uri: uri.toString(), status: 'ok' } }),
    })
    const ignored = ctx.agent.registerResource({
      id: 'ignored',
      name: 'Ignored',
      read: () => ({ json: { ignored: true } }),
    })
    ctx.agent.registerTool({
      id: 'increment-state',
      description: 'Increment the fixture state.',
      handler: () => {
        state.mutate(value => void (value.count += 1))
        fixed.notifyUpdated()
        ignored.notifyUpdated()
      },
    })
    ctx.agent.registerResource({
      id: 'logs',
      uriTemplate: 'devframe://logs/{name}',
      name: 'Logs',
      list: () => ({ resources: [{ uri: 'devframe://logs/app', name: 'App logs' }] }),
      read: (_uri: URL, variables: Readonly<Record<string, string | string[]>>) => ({
        json: { process: variables.name },
      }),
    })
  },
}

await createMcpServer(definition, { transport: 'stdio' })
