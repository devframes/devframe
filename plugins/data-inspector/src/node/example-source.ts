import type { DevframeNodeContext } from 'devframe/types'
import type { DataSourceEntry } from '../registry/index'
import os from 'node:os'
import process from 'node:process'

/** Id of the built-in example source (namespaced like every source id). */
export const EXAMPLE_SOURCE_ID = 'devframes:plugin:data-inspector:example'

class RequestLog {
  readonly startedAt = new Date()
  private secret = 'own-fields-are-visible'
  entries = new Map<string, { path: string, hits: number }>([
    ['home', { path: '/', hits: 41 }],
    ['docs', { path: '/docs', hits: 7 }],
    ['api', { path: '/api/data', hits: 23 }],
  ])
}

/** A small synthetic branch exercising every viewer capability. */
function createPlayground(): Record<string, unknown> {
  const node: Record<string, unknown> = { name: 'root' }
  node.self = node // circular structures render as $ref markers
  return {
    requests: new RequestLog(),
    tags: new Set(['dev', 'local', 'example']),
    middlewares: [
      { name: 'compression', handler: () => {} },
      { name: 'static', handler: () => {} },
    ],
    build: {
      hash: 'c3f7c4e',
      size: 1024n * 512n,
      modules: Array.from({ length: 300 }, (_, i) => ({
        id: `src/module-${i}.ts`,
        imports: i % 7,
        sizeKb: Math.round(Math.sin(i) * 40 + 50),
      })),
    },
    tree: node,
  }
}

/** The devframe context, projected to its inspectable surface. */
function describeContext(ctx: DevframeNodeContext): Record<string, unknown> {
  return {
    cwd: ctx.cwd,
    workspaceRoot: ctx.workspaceRoot,
    mode: ctx.mode,
    rpcFunctions: Array.from(ctx.rpc.definitions.keys()).sort(),
    services: ctx.services.keys().sort(),
    storage: {
      workspace: ctx.host.getStorageDir('workspace'),
      project: ctx.host.getStorageDir('project'),
      global: ctx.host.getStorageDir('global'),
    },
  }
}

function createExampleData(ctx?: DevframeNodeContext): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...(ctx ? { devframe: describeContext(ctx) } : {}),
    os: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      cpus: { count: os.cpus().length, model: os.cpus()[0]?.model },
      memory: { totalMb: Math.round(os.totalmem() / 1024 / 1024), freeMb: Math.round(os.freemem() / 1024 / 1024) },
      homedir: os.homedir(),
      uptimeHours: Math.round(os.uptime() / 36) / 100,
    },
    process: {
      pid: process.pid,
      execPath: process.execPath,
      argv: process.argv,
      versions: process.versions,
    },
    playground: createPlayground(),
  }
  // Own getters read at query time, so re-running shows the data is live.
  Object.defineProperties(data.process as object, {
    memory: { enumerable: true, get: () => process.memoryUsage() },
    uptimeSeconds: { enumerable: true, get: () => Math.round(process.uptime()) },
  })
  Object.defineProperty(data, 'queriedAt', {
    enumerable: true,
    get: () => new Date().toISOString(),
  })
  return data
}

/**
 * The built-in example source — always registered unless opted out
 * (`exampleSource: false`). Lets the viewer query simple environment info
 * (the devframe context: registered RPC functions, services, storage dirs;
 * OS and live process stats) plus a small playground branch exercising
 * everything the viewer can show (Maps, Sets, class instances, circulars,
 * BigInt, functions, query-time getters).
 */
export function createExampleDataSource(ctx?: DevframeNodeContext): DataSourceEntry {
  let data: Record<string, unknown> | undefined
  return {
    id: EXAMPLE_SOURCE_ID,
    title: 'Example data',
    description: 'Devframe context, OS and process info, plus a playground graph.',
    icon: 'i-ph:flask-duotone',
    data: () => data ??= createExampleData(ctx),
    queries: [
      ...(ctx
        ? [{
            title: 'Registered RPC functions',
            description: 'Everything callable on this devframe connection',
            query: 'devframe.rpcFunctions',
          }]
        : []),
      {
        title: 'OS at a glance',
        query: 'os.({ platform, arch, cpus, memory })',
      },
      {
        title: 'Live process memory',
        description: 'Query-time getter: re-run and watch it change',
        query: '{ memory: process.memory, uptime: process.uptimeSeconds, at: queriedAt }',
      },
      {
        title: 'Busiest endpoints',
        description: 'Live Map entries, sorted',
        query: 'playground.requests.entries.mapEntries().value.sort(hits desc)',
      },
      {
        title: 'Large modules as a table',
        description: 'Filter and project an array',
        query: 'playground.build.modules.[sizeKb > 80].({ id, sizeKb })',
      },
      { title: 'Everything', query: '' },
    ],
  }
}
