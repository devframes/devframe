import type { KnownEditor } from 'devframe/recipes/common-rpc-functions'
import type { DevframeServiceDefinition } from 'devframe/types'
import { defineRpcFunction } from 'devframe'
import { KNOWN_EDITORS } from 'devframe/recipes/common-rpc-functions'
import { s } from 'devframe/utils/simple-schema'
import { isAbsolute, relative, resolve } from 'pathe'
import pkg from '../package.json' with { type: 'json' }
import { diagnostics } from './diagnostics'

export const OPEN_SERVICE_PACKAGE = '@devframes/service-open'
export const OPEN_SERVICE_SCOPE = 'devframes:service:open'

export interface OpenServiceOptions {
  /**
   * Preferred editor command — one of the `KNOWN_EDITORS` `launch-editor`
   * recognizes. Auto-detected (via `LAUNCH_EDITOR` and common defaults)
   * when omitted. On merge, the later installer's choice wins.
   */
  editor?: KnownEditor
  /**
   * Additional directories files may be opened from, on top of the
   * context's `workspaceRoot` — e.g. a plugin's managed storage dir that
   * lives outside the workspace. Merged as a union across installers.
   */
  roots?: string[]
}

export interface OpenInEditorInput {
  /**
   * File to open — absolute, or relative to the service's `workspaceRoot`
   * (so a client with only a workspace-relative path, e.g. a message's file
   * position, can call this directly without a server-side bridge).
   */
  path: string
  line?: number
  column?: number
  /** Per-call editor override (one of `KNOWN_EDITORS`). */
  editor?: KnownEditor
}

export interface OpenServiceApi {
  /** Open a file (optionally at a line/column) in the user's editor. */
  openInEditor: (input: OpenInEditorInput) => Promise<void>
  /** Reveal a path in the OS file explorer. */
  openInFinder: (input: { path: string }) => Promise<void>
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'devframes:service:open:open-in-editor': (input: OpenInEditorInput) => Promise<void>
    'devframes:service:open:open-in-finder': (input: { path: string }) => Promise<void>
  }
  interface DevframeServicesRegistry {
    '@devframes/service-open': OpenServiceApi
  }
  interface DevframeServicesScopeRegistry {
    '@devframes/service-open': 'devframes:service:open'
  }
}

/**
 * The open wire service — `open-in-editor` / `open-in-finder` RPC shared by
 * every plugin on the host, replacing per-plugin registrations of the
 * (deprecated) `devframe/recipes/common-rpc-functions` recipes. Paths may be
 * absolute or relative to the `workspaceRoot`; the service refuses paths
 * outside the workspace root and the configured extra
 * {@link OpenServiceOptions.roots} (`DS_OPEN_0002`), and gates editor
 * commands to the `KNOWN_EDITORS` picklist so the RPC surface can't spawn an
 * arbitrary command.
 */
export function createOpenService(options?: OpenServiceOptions): DevframeServiceDefinition<OpenServiceApi, OpenServiceOptions> {
  return {
    package: OPEN_SERVICE_PACKAGE,
    version: pkg.version,
    scope: OPEN_SERVICE_SCOPE,
    options,
    // Option sets from multiple installers merge via devframe's default
    // deep-merge: `roots` union, `editor` last-wins.
    setup(ctx, { options }) {
      const allowedRoots = [ctx.workspaceRoot, ...(options?.roots ?? [])].map(root => resolve(root))

      /**
       * Resolve `path` (relative paths against `workspaceRoot`) and assert it
       * lands inside one of the allowed roots, or throw.
       */
      function assertAllowedPath(path: string): string {
        const resolved = isAbsolute(path) ? resolve(path) : resolve(ctx.workspaceRoot, path)
        const contained = allowedRoots.some((root) => {
          const rel = relative(root, resolved)
          return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
        })
        if (!contained)
          throw diagnostics.DS_OPEN_0002({ path })
        return resolved
      }

      const api: OpenServiceApi = {
        async openInEditor(input) {
          const path = assertAllowedPath(input.path)
          const target = input.line != null
            ? `${path}:${input.line}${input.column != null ? `:${input.column}` : ''}`
            : path
          const { launchEditor } = await import('devframe/utils/launch-editor')
          launchEditor(target, input.editor ?? options?.editor)
        },
        async openInFinder(input) {
          const path = assertAllowedPath(input.path)
          const { open } = await import('devframe/utils/open')
          await open(path)
        },
      }

      ctx.rpc.register(defineRpcFunction({
        name: 'open-in-editor',
        type: 'action',
        jsonSerializable: true,
        args: [s.object({
          path: s.string(),
          line: s.optional(s.number()),
          column: s.optional(s.number()),
          editor: s.optional(s.picklist(KNOWN_EDITORS)),
        })],
        returns: s.void(),
        handler: input => api.openInEditor(input),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'open-in-finder',
        type: 'action',
        jsonSerializable: true,
        args: [s.object({ path: s.string() })],
        returns: s.void(),
        handler: input => api.openInFinder(input),
      }))

      return api
    },
  }
}

export default createOpenService
