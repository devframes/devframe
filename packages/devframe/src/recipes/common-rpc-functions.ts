import * as v from 'valibot'
import { defineRpcFunction } from '../rpc/define'

/**
 * Editor commands that `launch-editor` (the library behind
 * `devframe/utils/launch-editor`) recognizes with a tailored
 * `file:line:column` invocation. `openInEditor`'s optional second argument
 * is restricted to this union, so the RPC surface can't be used to spawn an
 * arbitrary command.
 */
export type KnownEditor
  = | 'atom'
    | 'subl'
    | 'sublime'
    | 'sublime_text'
    | 'wstorm'
    | 'charm'
    | 'zed'
    | 'notepad++'
    | 'vim'
    | 'mvim'
    | 'joe'
    | 'gvim'
    | 'emacs'
    | 'emacsclient'
    | 'rmate'
    | 'mate'
    | 'code'
    | 'code-insiders'
    | 'codium'
    | 'vscodium'
    | 'trae'
    | 'antigravity'
    | 'cursor'
    | 'appcode'
    | 'clion'
    | 'idea'
    | 'phpstorm'
    | 'pycharm'
    | 'rubymine'
    | 'webstorm'
    | 'goland'
    | 'rider'

/** Runtime list of every {@link KnownEditor}, in the order `v.picklist` reports them. */
export const KNOWN_EDITORS: KnownEditor[] = [
  'atom',
  'subl',
  'sublime',
  'sublime_text',
  'wstorm',
  'charm',
  'zed',
  'notepad++',
  'vim',
  'mvim',
  'joe',
  'gvim',
  'emacs',
  'emacsclient',
  'rmate',
  'mate',
  'code',
  'code-insiders',
  'codium',
  'vscodium',
  'trae',
  'antigravity',
  'cursor',
  'appcode',
  'clion',
  'idea',
  'phpstorm',
  'pycharm',
  'rubymine',
  'webstorm',
  'goland',
  'rider',
]

/**
 * Prebuilt RPC action that opens a file in the user's configured editor.
 *
 * Registered name: `devframe:open-in-editor`.
 *
 * The optional second argument picks the editor command explicitly (must be
 * one of {@link KNOWN_EDITORS}); otherwise it's auto-detected per
 * `devframe/utils/launch-editor`.
 *
 * ```ts
 * import { openInEditor } from 'devframe/recipes/common-rpc-functions'
 *
 * defineDevframe({
 *   id: 'my-tool',
 *   name: 'My Tool',
 *   setup(ctx) {
 *     ctx.rpc.register(openInEditor)
 *   },
 * })
 * ```
 */
export const openInEditor = defineRpcFunction({
  name: 'devframe:open-in-editor',
  type: 'action',
  jsonSerializable: true,
  args: [v.string(), v.optional(v.picklist<KnownEditor[]>(KNOWN_EDITORS))],
  returns: v.void(),
  async handler(filename: string, editor?: KnownEditor) {
    const { launchEditor } = await import('devframe/utils/launch-editor')
    launchEditor(filename, editor)
  },
})

/**
 * Prebuilt RPC action that reveals a path in the OS file explorer.
 *
 * Registered name: `devframe:open-in-finder`.
 *
 * ```ts
 * import { openInFinder } from 'devframe/recipes/common-rpc-functions'
 *
 * ctx.rpc.register(openInFinder)
 * ```
 */
export const openInFinder = defineRpcFunction({
  name: 'devframe:open-in-finder',
  type: 'action',
  jsonSerializable: true,
  args: [v.string()],
  returns: v.void(),
  async handler(path: string) {
    const { open } = await import('devframe/utils/open')
    await open(path)
  },
})

/**
 * Convenience array bundling both helpers so callers can register them
 * in a single `forEach`.
 *
 * ```ts
 * import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'
 *
 * commonRpcFunctions.forEach(fn => ctx.rpc.register(fn))
 * ```
 */
export const commonRpcFunctions = [openInEditor, openInFinder] as const
