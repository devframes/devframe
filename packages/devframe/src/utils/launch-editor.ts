import launchImpl from 'launch-editor'

/**
 * Editor commands `launch-editor` recognizes with a tailored
 * `file:line:column` invocation. Callers that gate an RPC surface's editor
 * argument to this union keep it from spawning an arbitrary command.
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

/** Runtime list of every {@link KnownEditor}. */
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
 * Open a file in the user's editor.
 *
 * `target` may be a plain path, `file:line`, or `file:line:column`.
 *
 * If `editor` is provided, it is used as the editor command (e.g. `'code'`,
 * `'subl'`) or absolute binary path. Otherwise the editor is auto-detected
 * via the `LAUNCH_EDITOR` env var with a fallback to common defaults.
 */
export function launchEditor(target: string, editor?: string): void {
  launchImpl(target, editor)
}
