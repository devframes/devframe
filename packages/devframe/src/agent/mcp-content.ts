import type { McpContentBlock } from '../types/mcp'

/**
 * Registry symbol for the content blocks attached by {@link withMcpContent}.
 * `Symbol.for` keeps the key the same across duplicate copies of devframe.
 */
const MCP_CONTENT = Symbol.for('devframe:mcp-content')

/**
 * Attach MCP content blocks to a tool result, for example an image next to
 * its text. The MCP adapter sends these blocks as the `content` of the
 * `tools/call` result, in place of the default single JSON text block.
 *
 * The blocks are stored under a non-enumerable symbol key, so `value` itself
 * does not change: the RPC transport to the SPA, `returns` validation, and the
 * `structuredContent` of a tool with an output schema all see the plain value
 * and never the (often large) block data.
 *
 * `value` must be an object that is not frozen. Returns `value`.
 */
export function withMcpContent<T extends object>(value: T, content: readonly McpContentBlock[]): T {
  Object.defineProperty(value, MCP_CONTENT, {
    value: content,
    enumerable: false,
    configurable: true,
    writable: true,
  })
  return value
}

/**
 * Read the blocks attached by {@link withMcpContent}, or `undefined` when the
 * value carries none. The value is not validated here; the MCP adapter checks
 * each block before it sends it.
 *
 * @internal
 */
export function getMcpContent(value: unknown): unknown {
  if (value === null || typeof value !== 'object')
    return undefined
  return (value as Record<symbol, unknown>)[MCP_CONTENT]
}
