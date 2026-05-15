import { defineDiagnostics } from 'nostics'
import { devframeReporter } from '../utils/diagnostics-reporter'

export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [devframeReporter],
  codes: {
    DF0006: {
      why: (p: { name: string }) => `RPC function "${p.name}" is not registered`,
    },
    DF0007: {
      why: 'AsyncLocalStorage is not set, it likely to be an internal bug of the DevTools foundation',
    },
    DF0008: {
      why: (p: { distDir: string }) => `distDir ${p.distDir} does not exist`,
    },
    DF0012: {
      why: (p: { filepath: string }) => `Failed to parse storage file: ${p.filepath}, falling back to defaults.`,
    },
    DF0013: {
      why: (p: { key: string }) => `Shared state of "${p.key}" is not found, please provide an initial value for the first time`,
    },
    DF0014: {
      why: (p: { name: string }) => `RPC function "${p.name}" has an invalid \`agent\` field — \`description\` must be a non-empty string.`,
      fix: 'Provide a short description (~1–3 sentences) explaining what the tool does and when agents should invoke it.',
    },
    DF0015: {
      why: (p: { id: string }) => `Agent tool "${p.id}" is already registered.`,
      fix: 'Tool ids must be unique across RPC functions with an `agent` field and tools registered via `ctx.agent.registerTool()`.',
    },
    DF0016: {
      why: (p: { id: string }) => `Agent resource "${p.id}" is already registered.`,
    },
    DF0017: {
      why: (p: { transport: string, reason: string }) => `Failed to start MCP server (${p.transport}): ${p.reason}`,
    },
    DF0029: {
      why: (p: { channel: string, id: string, dropped: number }) =>
        `Stream "${p.channel}#${p.id}" dropped ${p.dropped} chunk(s) after exceeding the client high-water mark.`,
      fix: 'The consumer is too slow for the producer. Raise `highWaterMark` on the subscription, slow the producer, or batch chunks.',
    },
    DF0030: {
      why: (p: { channel: string, id: string }) =>
        `Stream "${p.channel}#${p.id}" is unknown — no producer has called \`channel.start({ id: "${p.id}" })\`.`,
      fix: 'Ensure the server-side producer is running before clients subscribe, or check for typos in the stream id.',
    },
    DF0031: {
      why: (p: { channel: string, id: string }) =>
        `Cannot write to closed stream "${p.channel}#${p.id}".`,
      fix: 'Track the producer lifecycle — guard writes with the `stream.signal.aborted` flag.',
    },
    DF0032: {
      why: (p: { channel: string }) =>
        `Streaming channel "${p.channel}" is already registered.`,
      fix: 'Each channel name must be unique within a context. Pick a different name or reuse the existing channel handle.',
    },
    DF0033: {
      why: (p: { id: string, reason: string }) =>
        `Failed to start dev RPC bridge for "${p.id}": ${p.reason}`,
      fix: 'Verify the bridge port is free and the devframe setup function does not throw. Pin a port via `cli.port` / `cli.portRange` on the definition, or via `devMiddleware.port` on `viteDevBridge`.',
    },
  },
})
