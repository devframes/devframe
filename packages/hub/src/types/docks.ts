import type { ConnectionMeta, EventEmitter } from 'devframe/types'
import type { JsonRenderer } from './json-render'

export interface DevframeDocksHost {
  readonly views: Map<string, DevframeDockUserEntry>
  readonly events: EventEmitter<{
    'dock:entry:updated': (entry: DevframeDockUserEntry) => void
  }>

  register: <T extends DevframeDockUserEntry>(entry: T, force?: boolean) => {
    update: (patch: Partial<T>) => void
  }
  update: (entry: DevframeDockUserEntry) => void
  values: (options?: { includeBuiltin?: boolean }) => DevframeDockEntry[]
}

/**
 * Per-entry toggles for the hub's synthesized built-in dock entries.
 *
 * Each flag defaults to `true` (the entry is present). Set one to `false` to
 * suppress that built-in everywhere it would otherwise appear — useful when a
 * host mounts a plugin that supersedes the built-in tab (e.g.
 * `@devframes/plugin-terminals` replacing the `~terminals` entry).
 */
export interface BuiltinDocksOptions {
  /**
   * Include the built-in `~terminals` dock entry.
   * @default true
   */
  terminals?: boolean
  /**
   * Include the built-in `~messages` dock entry.
   * @default true
   */
  messages?: boolean
  /**
   * Include the built-in `~settings` dock entry.
   * @default true
   */
  settings?: boolean
}

// Known categories the hub orders by default. Kits may pass their own
// category ids; `(string & {})` keeps autocomplete on the known set while
// allowing arbitrary string values.
export type DevframeDockEntryCategory
  = | 'app'
    | 'framework'
    | 'web'
    | 'advanced'
    | 'default'
    | '~builtin'
    | (string & {})

export type DevframeDockEntryIcon = string | { light: string, dark: string }

/**
 * A dock entry's `when` value, as authored.
 *
 * - `string` — a `whenexpr` expression, evaluated client-side against a
 *   `WhenContext` (unchanged from before).
 * - `boolean` — a static shortcut: `false` unconditionally hides the entry,
 *   `true` unconditionally shows it.
 * - `() => string | boolean | undefined` — a live clause, invoked server-side
 *   every time the dock's shared state is serialized. Lets a host give a
 *   registered/mounted dock the same dynamic visibility the built-in
 *   `~terminals`/`~messages` entries have, without relying on a getter that
 *   would be evaluated only once by `mountDevframe`'s `...options.dock` spread.
 *
 * Whichever form is authored, it is resolved down to the wire contract
 * (`string | undefined`) during serialization — see
 * {@link import('../node/when').resolveWhen}. Clients only ever see a
 * `string | undefined`, evaluated the same way as always.
 */
export type DevframeWhen = string | boolean | (() => string | boolean | undefined)

export interface DevframeDockEntryBase {
  id: string
  title: string
  icon: DevframeDockEntryIcon
  /**
   * The default order of the entry in the dock.
   * The higher the number the earlier it appears.
   * @default 0
   */
  defaultOrder?: number
  /**
   * The category of the entry
   * @default 'default'
   */
  category?: DevframeDockEntryCategory
  /**
   * Conditional visibility.
   * When set, the dock entry is only visible when it resolves to true.
   * A string uses the same `whenexpr` syntax as command `when` clauses and
   * is still evaluated client-side. A boolean or a function is a
   * server-side authoring convenience, resolved to a `string | undefined`
   * once per serialization — see {@link DevframeWhen}.
   *
   * Set to `'false'` (or a function returning `false`) to unconditionally
   * hide the entry.
   *
   * @example 'clientType == embedded'
   * @example () => sessions.size === 0 ? 'false' : undefined
   * @see {@link import('devframe/utils/when').evaluateWhen}
   */
  when?: DevframeWhen
  /**
   * Badge text to display on the dock icon (e.g., unread count)
   */
  badge?: string
  /**
   * Id of the group this entry belongs to. When set, hosts collapse this entry
   * under the matching group's button instead of showing it directly on the
   * dock bar.
   *
   * This is a flat pointer — membership, not containment. The entry stays an
   * independently-registered, top-level entry; only its rendering is grouped
   * downstream. If the referenced group is never registered, the entry renders
   * as a normal top-level entry (orphan tolerance).
   *
   * @see {@link DevframeViewGroup}
   */
  groupId?: string
}

export interface ClientScriptEntry {
  /**
   * The filepath or module name to import from
   */
  importFrom: string
  /**
   * The name to import the module as
   *
   * @default 'default'
   */
  importName?: string
}

export interface DevframeViewIframe extends DevframeDockEntryBase {
  type: 'iframe'
  url: string
  /**
   * The id of the iframe, if multiple tabs is assigned with the same id, the iframe will be shared.
   *
   * When not provided, it would be treated as a unique frame.
   */
  frameId?: string
  /**
   * Optional client script to import into the iframe
   */
  clientScript?: ClientScriptEntry
  /**
   * Enable remote-UI mode: the hub injects a connection descriptor
   * (WS URL + pre-approved auth token) into the iframe URL so a hosted
   * page can connect back via `connectRemoteDevframe()` from
   * `@devframes/hub/client` — without needing to ship a dist with the
   * plugin.
   *
   * Requires dev mode (no effect in build mode — no WS server exists).
   * When enabled, the dock is automatically hidden in build mode unless
   * the author provides an explicit `when` clause.
   */
  remote?: boolean | RemoteDockOptions
}

export interface RemoteDockOptions {
  /**
   * How to pass the connection descriptor to the hosted page.
   *
   * - `'fragment'` (default): appended as a URL fragment.
   *   Not sent in HTTP requests or Referer headers — safest for auth tokens.
   * - `'query'`: appended as a URL query parameter. Use when your hosting
   *   platform rewrites fragments or your SPA router repurposes the fragment
   *   for navigation. The token will appear in server access logs and
   *   outbound Referer headers.
   *
   * @default 'fragment'
   */
  transport?: 'fragment' | 'query'
  /**
   * Reject WS handshakes whose `Origin` header doesn't match the dock URL
   * origin. Turn off when the same hosted app is served from multiple
   * origins (e.g. preview deploys).
   *
   * @default true
   */
  originLock?: boolean
}

export interface RemoteConnectionInfo extends ConnectionMeta {
  backend: 'websocket'
  websocket: string
  v: 1
  authToken: string
  origin: string
}

export type DevframeViewLauncherStatus = 'idle' | 'loading' | 'success' | 'error'

export interface DevframeViewLauncher extends DevframeDockEntryBase {
  type: 'launcher'
  launcher: {
    icon?: DevframeDockEntryIcon
    title: string
    status?: DevframeViewLauncherStatus
    error?: string
    description?: string
    buttonStart?: string
    buttonLoading?: string
    onLaunch: () => Promise<void>
  }
}

export interface DevframeViewAction extends DevframeDockEntryBase {
  type: 'action'
  action: ClientScriptEntry
}

export interface DevframeViewCustomRender extends DevframeDockEntryBase {
  type: 'custom-render'
  renderer: ClientScriptEntry
}

export interface DevframeViewBuiltin extends DevframeDockEntryBase {
  type: '~builtin'
  id: '~terminals' | '~messages' | '~client-auth-notice' | '~settings' | '~popup'
}

export interface DevframeViewJsonRender extends DevframeDockEntryBase {
  type: 'json-render'
  /** JsonRenderer handle created by ctx.createJsonRenderer() */
  ui: JsonRenderer
}

/**
 * A dock group: a single dock-bar button that collapses every entry whose
 * {@link DevframeDockEntryBase.groupId} matches this group's `id`.
 *
 * A group carries its own `title`/`icon`/`category`/`defaultOrder`/`when`
 * (inherited from {@link DevframeDockEntryBase}) and has no view payload of its
 * own — hosts render its members in a popover / sub-navigation. It flows
 * through the same `register`/`update`/`values` machinery as every other entry,
 * keyed by `id`.
 *
 * Grouping is one level deep: a group entry must not itself set `groupId`.
 */
export interface DevframeViewGroup extends DevframeDockEntryBase {
  type: 'group'
  /**
   * Member id auto-opened when the group button is activated. When unset,
   * activating the group only reveals its members (popover-only); no view
   * opens until a member is chosen.
   */
  defaultChildId?: string
}

export type DevframeDockUserEntry = DevframeViewIframe | DevframeViewAction | DevframeViewCustomRender | DevframeViewLauncher | DevframeViewJsonRender | DevframeViewGroup

export type DevframeDockEntry = DevframeDockUserEntry | DevframeViewBuiltin

export type DevframeDockEntriesGrouped = [category: string, entries: DevframeDockEntry[]][]
