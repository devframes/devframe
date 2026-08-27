import type { DevframeDefinition } from '../../../../types/devframe'
import { createMcpServer } from '../../build-server'

const definition: DevframeDefinition = {
  id: 'progress-stdio-test',
  name: 'Progress stdio test',
  version: '1.0.0',
  packageName: '@devframe/progress-stdio-test',
  homepage: 'https://example.com',
  description: 'Stdio progress test fixture.',
  setup(ctx) {
    ctx.agent.registerTool({
      id: 'build',
      description: 'Build the project.',
      handler: async (_args, invocation) => {
        await invocation?.reportProgress({ progress: 1, total: 2, message: 'Compiling' })
        await invocation?.reportProgress({ progress: 2, total: 2, message: 'Testing' })
        return { status: 'complete' }
      },
    })
  },
}

await createMcpServer(definition, { transport: 'stdio' })
