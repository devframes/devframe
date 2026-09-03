import { defineHandler } from 'nitro'
import { hub } from '../../hub'

/**
 * The namespace root itself (`/__devframes/`) - the standalone hub UI from
 * `@devframes/hub-ui`. The `[...path]` sibling covers every path beneath it,
 * but a catch-all doesn't match its own empty subpath, so the root needs its
 * own route.
 */
export default defineHandler(event => hub.handler(event.req))
