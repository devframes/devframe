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
   * Conditional visibility expression.
   * When set, the dock entry is only visible when the expression evaluates to true.
   * Uses the same syntax as command `when` clauses.
   *
   * Set to `'false'` to unconditionally hide the entry.
   *
   * @example 'clientType == embedded'
   * @see {@link import('devframe/utils/when').evaluateWhen}
   */
  when?: string
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
