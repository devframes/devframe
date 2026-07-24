import type { ConnectionMeta, EventEmitter } from 'devframe/types'
import type { JsonRenderer } from './json-render'

export interface DevframeDocksHost {
  readonly views: Map<string, DevframeDockUserEntry>
  readonly events: EventEmitter<{
    'dock:entry:updated': (entry: DevframeDockUserEntry) => void
    'dock:activate': (activation: DevframeDockActivation) => void
  }>

  register: <T extends DevframeDockUserEntry>(entry: T, force?: boolean) => {
    update: (patch: Partial<T>) => void
  }
  update: (entry: DevframeDockUserEntry) => void
  values: () => DevframeDockEntry[]

  /**
   * Request the active viewer switch its focused dock to `dockId`, optionally
   * carrying `params` for the target dock to interpret (e.g. a terminals
   * session id).
   *
   * Any connected client may drive this via the `hub:docks:activate` RPC — a
   * mounted devframe running in its own iframe can steer the host shell's dock
   * selection, which is otherwise client-local. The request is delivered live
   * to connected clients (broadcast) and mirrored into the
   * `devframe:docks:active` shared state so a dock that mounts in response
   * still sees it. Activation is best-effort: unknown dock ids degrade
   * gracefully.
   */
  activate: (dockId: string, params?: Record<string, unknown>) => void
}

/**
 * A request to switch the active dock. `params` is an opaque, serializable
 * bag the target dock interprets — the terminals dock reads `params.sessionId`
 * to focus a specific session.
 */
export interface DevframeDockActivation {
  dockId: string
  params?: Record<string, unknown>
}

/**
 * Shape of the `devframe:docks:active` shared-state slot — the most recent
 * {@link DevframeDockActivation}, or `null` before any activation. Mirrored
 * so a dock that mounts in response to an activation can still converge on the
 * request instead of missing the live broadcast.
 */
export interface DevframeDocksActiveState {
  activation: DevframeDockActivation | null
}

// Known categories the hub orders by default (see
// {@link import('../constants').DEFAULT_CATEGORIES_ORDER}). Kits may pass their
// own category ids; `(string & {})` keeps autocomplete on the known set while
// allowing arbitrary string values. `~builtin` is reserved for the viewer's
// own built-in views (see {@link DevframeViewBuiltin}) and always sorts last.
export type DevframeDockEntryCategory
  = | 'framework' // framework internals (Vue / Nuxt / Vite)
    | 'app' // the user's own app tools
    | 'ui' // components, design system, styling
    | 'data' // state, storage, queries, database
    | 'web' // network, platform, accessibility
    | 'performance' // profiling, metrics, budgets
    | 'advanced' // power-user / low-level tools
    | 'docs' // documentation, references
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
   * The category of the entry — a field with a dual role that depends on
   * whether {@link groupId} resolves to a registered {@link DevframeViewGroup}:
   *
   * - **Ungrouped (or orphan) entry** — `category` is the entry's OUTER bucket
   *   on the dock bar, ordered by {@link import('../constants').DEFAULT_CATEGORIES_ORDER}.
   * - **Grouped entry** (a `groupId` that resolves to a registered group) —
   *   the OUTER bucket is instead the group's own `category`, and this field is
   *   reinterpreted as the entry's IN-GROUP sub-category, used to sub-divide and
   *   sort members inside the group's popover / sub-navigation.
   *
   * Falls back to `'default'` when omitted — both as an outer bucket and, for a
   * grouped member, as its in-group sub-bucket.
   *
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
   * Render-only conditional visibility expression, same syntax as {@link when}.
   * When it evaluates to `false`, a viewer omits the entry from the rendered
   * dock bar / list, but the entry stays registered and fully reachable —
   * `docks.activate()`/`switchEntry()` by id, RPC lookups, and anything else
   * that walks the raw entry list (e.g. the {@link DevframeViewIframe.subTabs}
   * frame-nav adapter) keep working exactly as if it were visible.
   *
   * Use this instead of {@link when} when an entry must remain part of the
   * model without a dock-bar button of its own — the canonical case is a
   * shared-frame {@link DevframeViewIframe.subTabs anchor}: set
   * `visibility: 'false'` on the anchor so only its synthesized member tabs
   * render, while the anchor itself keeps driving the postMessage nav loop.
   * `when`, by contrast, is the general relevance switch for the entry as a
   * whole; reach for `visibility` only for this render-only carve-out.
   *
   * Set to `'false'` to unconditionally hide the entry's own dock-bar button.
   *
   * @example 'false'
   * @see {@link import('devframe/utils/when').evaluateWhen}
   */
  visibility?: string
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
   * downstream.
   *
   * When the referenced group **is** registered, it supplies the entry's OUTER
   * dock-bar category (the group's own {@link category}), and this entry's own
   * {@link category} is reinterpreted as its IN-GROUP sub-category. When the
   * referenced group is **never** registered, the entry renders as a normal
   * top-level entry and falls back to using its own {@link category} as the
   * outer bucket (orphan tolerance).
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
   *
   * `frameId` is an axis independent of {@link DevframeDockEntryBase.groupId}:
   * it decides *which* iframe element a dock renders into (and which soft-nav
   * pool it joins), while `groupId` only affects dock-bar grouping. Docks that
   * share a `frameId` may live in one group, several groups, or none.
   */
  frameId?: string
  /**
   * Optional client script to import into the iframe
   */
  clientScript?: ClientScriptEntry
  /**
   * Soft-navigation target within a shared frame. Set on a **member** dock
   * (one of several docks sharing a {@link frameId}) to describe which internal
   * view the embedded app should show. The hub treats {@link NavTarget.path} as
   * opaque and hands it to the frame's nav shim over `postMessage`; switching to
   * this dock performs client-side navigation instead of reloading the iframe.
   *
   * The anchor dock (the one flagged with {@link subTabs}) leaves this unset.
   */
  navTarget?: NavTarget
  /**
   * Marks this iframe as a **shared-frame anchor** whose sub-tabs are discovered
   * at runtime over a host↔iframe `postMessage` protocol. The client host
   * auto-attaches the frame-nav adapter when this iframe mounts: it runs the
   * ready handshake, materializes one client-only member dock per reported tab
   * (grouped/soft-navigated via this anchor's {@link frameId}), and drives the
   * live navigation loop. Absent a shim, the anchor simply renders as a single
   * plain iframe dock.
   *
   * Set {@link DevframeDockEntryBase.visibility} to `'false'` on the anchor to
   * hide its own dock-bar button once tabs are discovered, surfacing only the
   * synthesized member docks while the anchor keeps driving the nav loop.
   */
  subTabs?: FrameSubTabsConfig
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

/**
 * A structured, soft-navigation target within a shared frame. `path` is opaque
 * to the hub — the embedded app maps it onto its own router.
 *
 * Kept to `path` + `query` so the shape survives shared-state's `Immutable`
 * projection cleanly (a `DevframeViewIframe` must still narrow back from its
 * immutable form). An `unknown`/recursive history-`state` field breaks that
 * round-trip, so richer per-navigation state is intentionally out of scope for
 * now — carry it in `query` or the app's own store.
 */
export interface NavTarget {
  path: string
  // `readonly` arrays keep this shape stable under the shared-state `Immutable`
  // projection, so a `Immutable<DevframeViewIframe>` still narrows back to
  // `DevframeViewIframe` (a mutable `string[]` would not).
  query?: Record<string, string | readonly string[]>
}

/**
 * Configuration for a {@link DevframeViewIframe.subTabs shared-frame anchor}.
 */
export interface FrameSubTabsConfig {
  /** Transport for tab discovery + the live nav loop. */
  protocol: 'postmessage'
  /**
   * How long (ms) the adapter waits for the shim's `ready` before treating the
   * frame as having no shim (the anchor renders as a single plain iframe dock,
   * and a navigation requested before readiness hard-navigates).
   *
   * @default 3000
   */
  handshakeTimeoutMs?: number
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
    /**
     * Bound command id: the launch button, command palette entry, and any
     * keybinding all resolve to this one handler. A viewer running out of
     * process dispatches it over the `hub:commands:execute` RPC — the
     * serializable path {@link onLaunch} can't cross, since a function is
     * dropped when the entry is projected into the `devframe:docks` shared
     * state. Register the command (with its handler) via `ctx.commands`.
     */
    command?: string
    /**
     * Id of the terminal session this launcher tracks (e.g. the one returned
     * by `ctx.terminals.startChildProcess`). A viewer surfaces a first-class
     * "view in terminal" action that calls `hub:docks:activate` with the
     * terminals dock id and `{ sessionId: terminalSessionId }`, jumping the
     * user straight to the running process.
     */
    terminalSessionId?: string
    /**
     * Latest single line of progress for inline display beneath the launcher
     * (e.g. the tail of the tracked session's output). Author-set: the owner
     * patches it via `docks.update()` as the process reports progress.
     */
    digest?: string
    /**
     * In-process launch handler. Optional: a same-process host can invoke it
     * directly, but it does not survive projection into shared state, so an
     * out-of-process viewer relies on {@link command} instead. Provide one or
     * both.
     */
    onLaunch?: () => Promise<void>
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

/**
 * A view rendered natively by the viewer rather than by a plugin — the
 * settings panel, the terminals feed, the messages feed, etc. A high-level
 * integration registers the built-in views it wants; the viewer recognizes the
 * reserved `id` and renders its own UI for it.
 *
 * Its {@link DevframeDockEntryBase.category} defaults to `'~builtin'` when
 * omitted, so built-in views group together and sort last without every
 * integration repeating it.
 */
export interface DevframeViewBuiltin extends DevframeDockEntryBase {
  type: '~builtin'
  id: string
}

/**
 * @deprecated json-render moved out of the hub into the opt-in
 * `@devframes/json-render` integration in 0.7, which contributes its own
 * `'json-render'` entry (carrying a serializable view ref, not a live
 * `JsonRenderer` handle) to {@link DevframeDockEntryRegistry} via declaration
 * merging. This type is kept for compatibility but is no longer a member of
 * {@link DevframeDockUserEntry} — use `@devframes/json-render/hub` instead.
 * Removed in 0.8.
 */
export interface DevframeViewJsonRender extends DevframeDockEntryBase {
  type: 'json-render'
  /** JsonRenderer handle created by the deprecated ctx.createJsonRenderer() */
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
 * The group's `category` is the OUTER bucket for the group button itself AND
 * for every one of its members — a member's own `category` no longer decides
 * its outer bucket, but is reinterpreted as an in-group sub-category that
 * sub-divides and sorts members inside this group. A group with no `category`
 * buckets itself and its members under `'default'`.
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
  /**
   * Per-group override of the in-group sub-category ordering — a map of
   * sub-category id → ordering weight (lower sorts earlier), mirroring the
   * shape of {@link import('../constants').DEFAULT_CATEGORIES_ORDER}.
   *
   * A member's own {@link DevframeDockEntryBase.category} is reinterpreted as
   * its IN-GROUP sub-category, and members are sub-divided and sorted by those
   * sub-categories. By default that sort follows the hub-wide
   * `DEFAULT_CATEGORIES_ORDER`; set this to reorder the sub-categories **inside
   * this group only**, leaving the outer dock-bar ordering (and every other
   * group) untouched.
   *
   * Keys are merged over the defaults, so you only list the sub-categories you
   * want to move; any sub-category absent from the map keeps its default weight
   * (falling back to `0`).
   *
   * @example
   * ```ts
   * // In the "nuxt" group, surface `app` tools before `framework` internals.
   * { type: 'group', id: 'nuxt', categoryOrder: { app: -200 } }
   * ```
   */
  categoryOrder?: Record<string, number>
}

/**
 * The **open** registry of dock entry variants, keyed by their `type`
 * discriminator. The hub ships the framework-neutral built-ins; opt-in
 * integrations contribute their own variants through declaration merging —
 * e.g. `@devframes/json-render/hub` adds a `'json-render'` entry. The hub
 * itself stays agnostic: it hard-codes no integration-specific variant.
 *
 * @example
 * ```ts
 * // in an opt-in integration package
 * declare module '@devframes/hub/types' {
 *   interface DevframeDockEntryRegistry {
 *     'my-view': MyDockEntry
 *   }
 * }
 * ```
 */
export interface DevframeDockEntryRegistry {
  'iframe': DevframeViewIframe
  'action': DevframeViewAction
  'custom-render': DevframeViewCustomRender
  'launcher': DevframeViewLauncher
  'group': DevframeViewGroup
  '~builtin': DevframeViewBuiltin
}

export type DevframeDockUserEntry = DevframeDockEntryRegistry[keyof DevframeDockEntryRegistry]

export type DevframeDockEntry = DevframeDockUserEntry

export type DevframeDockEntriesGrouped = [category: string, entries: DevframeDockEntry[]][]
