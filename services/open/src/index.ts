import type { KnownEditor } from 'devframe/recipes/common-rpc-functions'
import type { DevframeServiceDefinition } from 'devframe/types'
import { realpath } from 'node:fs/promises'
import { defineRpcFunction } from 'devframe'
import { KNOWN_EDITORS } from 'devframe/recipes/common-rpc-functions'
import { s } from 'devframe/utils/simple-schema'
import { dirname, isAbsolute, normalize, relative, resolve } from 'pathe'
import pkg from '../package.json' with { type: 'json' }
import { diagnostics } from './diagnostics'

/** Canonical path of the nearest existing ancestor of `absolute`. */
async function nearestExistingCanonical(absolute: string): Promise<string> {
  let current = absolute
  for (;;) {
    try {
      return normalize(await realpath(current))
    }
    catch {
      const parent = dirname(current)
      if (parent === current)
        return current
      current = parent
    }
  }
}

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
      const allowedRoots = [ctx.workspaceRoot, ...(options?.roots ?? [])].map(r => resolve(r))
      // Canonical forms of the same roots (symlinks in the root paths
      // resolved), computed once for the symlink-aware pass.
      const canonicalRoots = Promise.all(allowedRoots.map(r => nearestExistingCanonical(r)))

      const within = (roots: string[], p: string): boolean => roots.some((root) => {
        const rel = relative(root, p)
        return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
      })

      /**
       * Resolve `path` (relative paths against `workspaceRoot`) and assert it
       * lands inside one of the allowed roots, or throw. The lexical pass
       * rejects plain `..`/absolute escapes; the canonical pass rejects a
       * symlink that would redirect the open outside every root, while still
       * allowing not-yet-existing files under a root.
       */
      async function assertAllowedPath(path: string): Promise<string> {
        const resolved = isAbsolute(path) ? resolve(path) : resolve(ctx.workspaceRoot, path)
        if (!within(allowedRoots, resolved) || !within(await canonicalRoots, await nearestExistingCanonical(resolved)))
          throw diagnostics.DS_OPEN_0002({ path })
        return resolved
      }

      const api: OpenServiceApi = {
        async openInEditor(input) {
          const path = await assertAllowedPath(input.path)
          const target = input.line != null
            ? `${path}:${input.line}${input.column != null ? `:${input.column}` : ''}`
            : path
          const { launchEditor } = await import('devframe/utils/launch-editor')
          launchEditor(target, input.editor ?? options?.editor)
        },
        async openInFinder(input) {
          const path = await assertAllowedPath(input.path)
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
