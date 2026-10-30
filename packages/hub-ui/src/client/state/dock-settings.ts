import type { DevframeDockEntriesGrouped, DevframeDockEntry, DevframeDocksUserSettings, DevframeViewGroup } from '@devframes/hub'
import type { Immutable } from 'devframe/utils/shared-state'
import type { WhenContext } from 'devframe/utils/when'
import type { MessageKey } from '../i18n'
import { evaluateWhen } from 'devframe/utils/when'
import { DEFAULT_CATEGORIES_ORDER, INSPECTOR_DOCK_ID } from '../constants'
import { t } from '../i18n'
import { getDefaultTitle } from './locale'
import { hubUiSetting } from './settings-defaults'
// Registers hub-ui's reference-viewer settings onto DevframeDocksUserSettings.
import '../types'

export type { DevframeDockEntriesGrouped }
export type { DevframeDocksUserSettings }

/**
 * Synthetic category that collects pinned dock entries. Pinning re-buckets an
 * entry here instead of merely floating it to the top of its home category, so
 * pinned entries lead the dock bar (and, for grouped members, lead inside their
 * group). The `~` prefix marks it internal, mirroring `~builtin`; it is never
 * user-hideable and does not exist upstream in `DEFAULT_CATEGORIES_ORDER`.
 */
const PINNED_CATEGORY = '~pinned'

/**
 * Order weight for {@link PINNED_CATEGORY}. Strongly negative so the Pinned
 * bucket always sorts before every real category (`framework` leads the
 * upstream table at `-100`). Applied as a local override in the sort rather
 * than added to the upstream `DEFAULT_CATEGORIES_ORDER` table, keeping the pin
 * feature entirely client-side.
 */
const PINNED_CATEGORY_ORDER = -100000

/**
 * Resolve a category's sort weight, layering the local {@link PINNED_CATEGORY}
 * override, then a caller-supplied `overrides` map (a group's own
 * {@link DevframeViewGroup.categoryOrder}), on top of the upstream
 * {@link DEFAULT_CATEGORIES_ORDER} table. `overrides` is per-call; passing a
 * group's map only reweights that group's in-group sub-categories, never the
 * outer bar or any other group.
 */
function categoryOrder(category: string, overrides?: Record<string, number>): number {
  if (category === PINNED_CATEGORY)
    return PINNED_CATEGORY_ORDER
  return overrides?.[category] ?? DEFAULT_CATEGORIES_ORDER[category] ?? 0
}

export interface SplitGroupsResult {
  visible: DevframeDockEntriesGrouped
  overflow: DevframeDockEntriesGrouped
  /**
   * The recent docks raised into their own slots, newest first, rendered
   * after the visible items and before the overflow button. Empty when no
   * recent dock needs a slot: a recent dock that already sits inside the
   * visible slice (a top-level entry, or a pinned member) renders in place
   * there instead.
   */
  recent: DevframeDockEntry[]
}

/**
 * Resolve a dock entry's icon down to a single icon string.
 *
 * A dock icon may be a string or a `{ light, dark }` pair, but a command's icon
 * is string-only. When projecting dock entries into commands (palette + Shortcuts
 * settings) we collapse the object form to a single string rather than dropping
 * it, because otherwise object-icon docks (e.g. a branded dock group) lose their
 * icon entirely. Returns `undefined` only when no icon is available.
 */
export function resolveCommandIcon(icon: DevframeDockEntry['icon']): string | undefined {
  if (typeof icon === 'string')
    return icon
  return icon?.light ?? icon?.dark
}

const CATEGORY_LABELS: Record<string, MessageKey> = {
  'default': 'category.default',
  'app': 'category.app',
  'framework': 'category.framework',
  'web': 'category.web',
  'advanced': 'category.advanced',
  '~builtin': 'category.builtin',
  [PINNED_CATEGORY]: 'category.pinned',
}

/**
 * Internal categories the user cannot hide via `docksCategoriesHidden`. Both
 * are `~`-prefixed synthetic buckets: `~builtin` (always-present built-ins) and
 * `~pinned` (the pinned bucket, whose membership the user controls per-entry
 * via the pin toggle instead).
 */
export function isCategoryHideable(category: string): boolean {
  return category !== '~builtin' && category !== PINNED_CATEGORY
}

/**
 * Human label for a dock category id, used for category headers (settings) and
 * in-group sub-category nodes (command palette). Falls back to the raw id for
 * custom categories a kit may register.
 */
export function getCategoryLabel(category: string): string {
  const key = CATEGORY_LABELS[category]
  return key ? t(key) : category
}

/**
 * Collect the ids of every registered dock group (`type: 'group'`).
 *
 * Grouping is one level deep, so a group entry never points at another group;
 * this set is the authority for deciding whether an entry's `groupId` resolves
 * to a real group (membership) or dangles (orphan, rendered as a normal
 * top-level entry).
 */
export function getRegisteredGroupIds(entries: DevframeDockEntry[]): Set<string> {
  const ids = new Set<string>()
  for (const entry of entries) {
    if (entry.type === 'group')
      ids.add(entry.id)
  }
  return ids
}

/**
 * Resolve the group entry an entry belongs to, or `undefined` when the entry
 * is top-level or its `groupId` references a group that was never registered.
 */
export function getEntryGroup(
  entries: DevframeDockEntry[],
  entry: DevframeDockEntry | null | undefined,
): DevframeViewGroup | undefined {
  if (!entry || entry.type === 'group' || !entry.groupId)
    return undefined
  const group = entries.find(e => e.id === entry.groupId)
  return group?.type === 'group' ? group : undefined
}

/**
 * Group a group's members by their **in-group sub-category** and sort them the
 * same way the dock bar sorts (custom order, then default order). Members
 * hidden by user settings or a falsy `when` clause are filtered out unless
 * `includeHidden`.
 *
 * A member's own `category` field is its in-group sub-category (defaulting to
 * `'default'`); the group's `category` is the *outer* bucket the whole group
 * lives in, so it never bleeds into the sub-category split here. A pinned member
 * moves to a `~pinned` sub-category (leading the group, via
 * {@link PINNED_CATEGORY_ORDER}); the dock bar also shows it on its own (see
 * `liftPinnedMembers` on {@link docksGroupByCategories}). Sub-categories are ordered by the same
 * {@link DEFAULT_CATEGORIES_ORDER} table as top-level categories, unless the
 * group entry itself sets {@link DevframeViewGroup.categoryOrder}, whose
 * weights take precedence for this group's sub-categories only, leaving every
 * other group and the outer bar on the shared table. Sub-categories are not
 * independently hideable (the outer category-hide toggle does not apply
 * inside a group).
 */
export function getGroupMembersGrouped(
  entries: DevframeDockEntry[],
  groupId: string,
  settings?: Immutable<DevframeDocksUserSettings>,
  options?: { includeHidden?: boolean, whenContext?: WhenContext },
): DevframeDockEntriesGrouped {
  const members = entries.filter(e => e.type !== 'group' && e.groupId === groupId)
  if (!settings)
    return members.length ? [['default', members]] : []
  const group = entries.find((e): e is DevframeViewGroup => e.type === 'group' && e.id === groupId)
  // Group by the members' own `category` (the in-group sub-category), never the
  // group's category. Category-hide is an outer-bar concern, so it is ignored.
  // The group's own `categoryOrder`, if set, reweights only this split.
  return docksGroupByCategories(members, settings, { ...options, ignoreCategoryHidden: true, categoryOrderOverride: group?.categoryOrder })
}

/**
 * List the member entries of a group as a flat array, preserving the same
 * sub-category order + sorting {@link getGroupMembersGrouped} produces. Members
 * hidden by user settings or a falsy `when` clause are filtered out unless
 * `includeHidden`. Use this where the caller only needs the members in display
 * order (e.g. the group button's active check, empty-group detection); use
 * {@link getGroupMembersGrouped} where the in-group sub-category split matters.
 */
export function getGroupMembers(
  entries: DevframeDockEntry[],
  groupId: string,
  settings?: Immutable<DevframeDocksUserSettings>,
  options?: { includeHidden?: boolean, whenContext?: WhenContext },
): DevframeDockEntry[] {
  return getGroupMembersGrouped(entries, groupId, settings, options).flatMap(([, items]) => items)
}

/**
 * Resolve a group's `defaultChildId` to its target member, for the "clicking
 * the group button jumps straight to this member" behavior (the dock-bar
 * button and `switchEntry`'s own group→member resolution both need this).
 *
 * Respects the member's own `when` clause: a conditionally-unavailable
 * target (e.g. `when: 'clientType == embedded'` evaluating false) is not a
 * valid default and this returns `undefined` so the caller falls back to its
 * own behavior (open the popover, or pick another member). Deliberately
 * ignores the render-only `visibility` clause: `visibility` never affects
 * reachability (see {@link docksGroupByCategories}'s `visibility` check), and
 * jumping straight to a `defaultChildId` target is exactly the kind of
 * id-based activation the render-only contract says stays unaffected; only
 * the target's own dock-bar button (if it has one) should disappear.
 */
export function resolveGroupDefaultChild(
  entries: DevframeDockEntry[],
  groupId: string,
  defaultChildId: string | undefined,
  whenContext?: WhenContext,
): DevframeDockEntry | undefined {
  if (!defaultChildId)
    return undefined
  const member = entries.find(e => e.type !== 'group' && e.groupId === groupId && e.id === defaultChildId)
  if (!member)
    return undefined
  if (member.when) {
    if (whenContext) {
      if (!evaluateWhen(member.when, whenContext))
        return undefined
    }
    else if (member.when === 'false') {
      return undefined
    }
  }
  return member
}

/**
 * Resolve the member a group activation opens, layering the per-tab "last
 * opened member" memory (`DockSessionStorage.groupLastChildIds`) over the
 * author's `defaultChildId`. A remembered non-action member wins while it still
 * resolves (it exists in the group and its `when` clause holds), so reopening
 * a group lands back on the panel the developer last used. One-shot actions are
 * skipped, including values persisted by an older client. Otherwise the
 * `defaultChildId` target is tried under the same rules (both via
 * {@link resolveGroupDefaultChild}, so the render-only `visibility` clause is
 * ignored for either candidate). Returns `undefined` when neither resolves:
 * the caller falls back to its own behavior (the dock-bar group button opens
 * the member popover; `switchEntry` picks the first member).
 */
export function resolveGroupPreferredChild(
  entries: DevframeDockEntry[],
  group: DevframeViewGroup,
  lastChildId: string | undefined,
  whenContext?: WhenContext,
): DevframeDockEntry | undefined {
  const remembered = resolveGroupDefaultChild(entries, group.id, lastChildId, whenContext)
  return (remembered?.type === 'action' ? undefined : remembered)
    ?? resolveGroupDefaultChild(entries, group.id, group.defaultChildId, whenContext)
}

function isClauseHidden(clause: string | undefined, whenContext: WhenContext | undefined): boolean {
  if (!clause)
    return false
  return whenContext ? !evaluateWhen(clause, whenContext) : clause === 'false'
}

// Whether a render pass (dock bar/popover/sidebar) drops the entry's own button.
// The Devframe Inspector is hidden until opted into via Settings → Advanced;
// resolved through `hubUiSetting` since `settings` may be a bare defaults object.
function isEntryRenderHidden(
  entry: DevframeDockEntry,
  settings: Immutable<DevframeDocksUserSettings>,
  whenContext: WhenContext | undefined,
): boolean {
  if (isClauseHidden(entry.when, whenContext) || isClauseHidden(entry.visibility, whenContext))
    return true
  if (entry.id === INSPECTOR_DOCK_ID && !hubUiSetting(settings, 'showDevframeInspector'))
    return true
  return settings.docksHidden.includes(entry.id)
}

// A grouped member's OUTER bucket is its group's category; in the in-group split
// no group entry is present, so members fall back to their own category.
function collectGroupCategories(entries: DevframeDockEntry[]): Map<string, string> {
  const groupCategories = new Map<string, string>()
  for (const entry of entries) {
    if (entry.type === 'group')
      groupCategories.set(entry.id, entry.category ?? 'default')
  }
  return groupCategories
}

function compareCategoryOrder(a: string, b: string, override: Record<string, number> | undefined): number {
  const ia = categoryOrder(a, override)
  const ib = categoryOrder(b, override)
  return ib === ia ? b.localeCompare(a) : ia - ib
}

function compareEntryOrder(a: DevframeDockEntry, b: DevframeDockEntry, docksCustomOrder: Immutable<DevframeDocksUserSettings>['docksCustomOrder']): number {
  const customA = docksCustomOrder[a.id] ?? 0
  const customB = docksCustomOrder[b.id] ?? 0
  if (customA !== customB)
    return customA - customB
  const ia = a.defaultOrder ?? 0
  const ib = b.defaultOrder ?? 0
  return ib === ia ? getDefaultTitle(b).localeCompare(getDefaultTitle(a)) : ia - ib
}

// A pinned top-level entry or group button re-buckets into `~pinned`. A grouped
// member's outer bucket is its group's category, unless the member is lifted
// onto the bar (`liftPinnedMembers`), where it joins `~pinned` too.
function resolveOuterCategory(
  entry: DevframeDockEntry,
  resolvedGroupCategory: string | undefined,
  docksPinned: readonly string[],
  liftPinnedMembers: boolean,
): string {
  const ownCategory = resolvedGroupCategory ?? entry.category ?? 'default'
  return docksPinned.includes(entry.id) && (resolvedGroupCategory === undefined || liftPinnedMembers)
    ? PINNED_CATEGORY
    : ownCategory
}

// Collapse grouped members out of the top-level bar (orphans stay visible).
// A lifted pinned member stays, so it gets its own button on the bar.
function isCollapsedMember(
  entry: DevframeDockEntry,
  resolvedGroupCategory: string | undefined,
  docksPinned: readonly string[],
  liftPinnedMembers: boolean,
): boolean {
  return resolvedGroupCategory !== undefined && !(liftPinnedMembers && docksPinned.includes(entry.id))
}

function bucketEntriesByCategory(
  entries: DevframeDockEntry[],
  groupCategories: Map<string, string>,
  settings: Immutable<DevframeDocksUserSettings>,
  options: { includeHidden: boolean, whenContext: WhenContext | undefined, collapseGroups: boolean, ignoreCategoryHidden: boolean, liftPinnedMembers: boolean },
): Map<string, DevframeDockEntry[]> {
  const { docksCategoriesHidden, docksPinned } = settings
  const { includeHidden, whenContext, collapseGroups, ignoreCategoryHidden, liftPinnedMembers } = options
  const map = new Map<string, DevframeDockEntry[]>()
  for (const entry of entries) {
    const resolvedGroupCategory = entry.type !== 'group' && entry.groupId
      ? groupCategories.get(entry.groupId)
      : undefined

    if (collapseGroups && isCollapsedMember(entry, resolvedGroupCategory, docksPinned, liftPinnedMembers))
      continue
    if (!includeHidden && isEntryRenderHidden(entry, settings, whenContext))
      continue

    const category = resolveOuterCategory(entry, resolvedGroupCategory, docksPinned, liftPinnedMembers)
    // `~pinned` is never hideable, so a pinned entry survives its category being hidden.
    if (!includeHidden && !ignoreCategoryHidden && docksCategoriesHidden.includes(category))
      continue

    if (!map.has(category))
      map.set(category, [])
    map.get(category)!.push(entry)
  }
  return map
}

/**
 * Group and sort dock entries based on user settings.
 * Filters out hidden entries and categories, then sorts by custom order and
 * default order within each category.
 *
 * Both `when` and its render-only counterpart `visibility` only ever drop an
 * entry out of the grouped result *this call* produces; the entry always
 * remains in the caller's raw `entries` array, so activation, RPC, and the
 * `subTabs` frame-nav adapter (which read `entries` directly rather than a
 * grouped result) are unaffected by either clause.
 *
 * Outer bucketing follows the dual role of `category`: a grouped member whose
 * `groupId` resolves to a registered group takes that **group's** `category` as
 * its outer bucket (its own `category` is the in-group sub-category instead).
 * When `collapseGroups` is set those members are folded away entirely and only
 * the group entry (carrying the group's own `category`) represents them on the
 * bar, so the outer bucket is always the group's category. Orphan members
 * (whose `groupId` references no registered group) fall back to their own
 * `category`.
 *
 * Pinning re-buckets an entry into {@link PINNED_CATEGORY} in place of the
 * category slot it would otherwise occupy: the outer bucket for a top-level
 * entry or group button, or the in-group sub-category for a member (the
 * members-only in-group split has no group entries, so `resolvedGroupCategory`
 * is undefined there and the member's own category slot is the one replaced).
 * A grouped member's outer bucket is re-pinned only with `liftPinnedMembers`:
 * the dock bar sets it, so a pinned member gets its own bar button (opening
 * it opens that member, and its group button lights up as active) as well as
 * leading inside its group. Without it (the settings list, which already
 * shows members under their group) pinning only reorders the member inside
 * its group.
 * Because the pinned bucket is chosen before the category-hide check and is
 * itself never hideable, a pinned entry stays visible even when its original
 * category is hidden.
 *
 * `categoryOrderOverride` reweights the categories produced by *this call*
 * (used by {@link getGroupMembersGrouped} to apply a group's own
 * {@link DevframeViewGroup.categoryOrder} to its in-group sub-category split)
 * and it never touches the shared {@link DEFAULT_CATEGORIES_ORDER} table, so it
 * has no effect on any other call, group, or the outer bar.
 */
export function docksGroupByCategories(
  entries: DevframeDockEntry[],
  settings: Immutable<DevframeDocksUserSettings>,
  options?: { includeHidden?: boolean, whenContext?: WhenContext, collapseGroups?: boolean, ignoreCategoryHidden?: boolean, liftPinnedMembers?: boolean, categoryOrderOverride?: Record<string, number> },
): DevframeDockEntriesGrouped {
  const { docksCustomOrder } = settings
  const { includeHidden = false, whenContext, collapseGroups = false, ignoreCategoryHidden = false, liftPinnedMembers = false, categoryOrderOverride } = options ?? {}

  const groupCategories = collectGroupCategories(entries)
  const map = bucketEntriesByCategory(entries, groupCategories, settings, { includeHidden, whenContext, collapseGroups, ignoreCategoryHidden, liftPinnedMembers })

  const grouped = Array
    .from(map.entries())
    .sort(([a], [b]) => compareCategoryOrder(a, b, categoryOrderOverride))

  // Ordering within a category (including `~pinned`): custom, default, then title.
  for (const [, items] of grouped)
    items.sort((a, b) => compareEntryOrder(a, b, docksCustomOrder))

  return grouped
}

export interface SidebarCapacityOptions {
  /** Measured height of the rail root, in px. */
  availableHeight: number
  /**
   * Fixed vertical overhead that is always present regardless of member count:
   * the root's padding, the pinned group anchor, and the anchor divider.
   */
  reservedHeight: number
  /** Height of one member button, including its inter-item gap. */
  itemHeight: number
  /** Height of one sub-category divider, including its gaps. */
  dividerHeight: number
  /** Height of the "show more" button, including its gap. */
  moreButtonHeight: number
  /** Number of sub-category dividers that could render (sub-categories − 1). */
  dividerCount: number
  /** Total member count across every sub-category. */
  totalItems: number
}

/**
 * Derive how many group side nav member buttons fit in the measured rail height.
 *
 * Two-pass: first test whether every member fits with no show-more button; if
 * they do, the full count is returned (no button, no overflow). Otherwise the
 * show-more button's height is reserved and the capacity recomputed, so the
 * button only ever costs a slot when it is actually shown.
 *
 * The sub-category divider budget is subtracted up front for every divider that
 * might render, keeping the estimate conservative, so the rail may fold one
 * member early into the popover, but it never clips.
 */
export function deriveSidebarCapacity(options: SidebarCapacityOptions): number {
  const { availableHeight, reservedHeight, itemHeight, dividerHeight, moreButtonHeight, dividerCount, totalItems } = options

  if (totalItems <= 0 || itemHeight <= 0)
    return 0

  const budget = availableHeight - reservedHeight - Math.max(0, dividerCount) * dividerHeight

  // Pass 1: does everything fit without a show-more button?
  const fitWithoutButton = Math.floor(budget / itemHeight)
  if (fitWithoutButton >= totalItems)
    return totalItems

  // Pass 2: overflow is unavoidable, so reserve the show-more button's slot.
  const fitWithButton = Math.floor((budget - moreButtonHeight) / itemHeight)
  return Math.max(0, fitWithButton)
}

/** Slice grouped entries at `capacity`, preserving category buckets. */
function splitGroupsAt(
  groups: DevframeDockEntriesGrouped,
  capacity: number,
): { visible: DevframeDockEntriesGrouped, overflow: DevframeDockEntriesGrouped } {
  const visible: DevframeDockEntriesGrouped = []
  const overflow: DevframeDockEntriesGrouped = []
  let left = capacity

  for (const [category, items] of groups) {
    if (left <= 0) {
      overflow.push([category, items])
    }
    else if (items.length > left) {
      visible.push([category, items.slice(0, left)])
      overflow.push([category, items.slice(left)])
      left = 0
    }
    else {
      left -= items.length
      visible.push([category, items])
    }
  }

  return { visible, overflow }
}

/** Whether any bucket of a grouped split contains the entry id. */
function groupsHaveEntry(groups: DevframeDockEntriesGrouped, id: string): boolean {
  return groups.some(([, items]) => items.some(item => item.id === id))
}

function countItems(groups: DevframeDockEntriesGrouped): number {
  return groups.reduce((acc, [, items]) => acc + items.length, 0)
}

/**
 * Slice at `capacity`, but fold a lone overflowing entry back into `visible`:
 * a whole overflow affordance (button + badge + popover) just to reveal one
 * icon costs more chrome than it saves, so that entry takes the slot the
 * button would have used.
 */
function splitGroupsWithFold(
  groups: DevframeDockEntriesGrouped,
  capacity: number,
): { visible: DevframeDockEntriesGrouped, overflow: DevframeDockEntriesGrouped } {
  if (countItems(groups) <= capacity + 1)
    return { visible: groups, overflow: [] }
  return splitGroupsAt(groups, capacity)
}

/**
 * Split grouped entries into visible and overflow based on capacity.
 *
 * A lone overflowing entry folds back into `visible` instead of staying in
 * `overflow` (see {@link splitGroupsWithFold}). Folding only triggers for
 * exactly one overflowing entry; two or more still overflow normally.
 *
 * `recentEntries` (see {@link DockSessionStorage.recentDockIds}; resolve them
 * via {@link resolveRecentDockEntries} first) are the docks the user last
 * opened from beyond the bar. Each one that is not already in the visible
 * slice is lifted out of the overflow and returned in `recent`, for the bar to
 * render in its own slot after the visible items. Recent slots come on top of
 * `capacity`, so opening a tool never pushes a bar item into the overflow. A
 * grouped member has no bar button of its own (unless it is pinned), so a
 * recent member always gets a slot, even when the bar does not overflow.
 */
export function docksSplitGroupsWithCapacity(
  groups: DevframeDockEntriesGrouped,
  capacity: number,
  recentEntries: readonly DevframeDockEntry[] = [],
): SplitGroupsResult {
  const natural = splitGroupsWithFold(groups, capacity)
  const recent = recentEntries.filter(entry => !groupsHaveEntry(natural.visible, entry.id))
  if (recent.length === 0)
    return { ...natural, recent }

  // Raised entries sit beyond the visible slice, so dropping them from the
  // groups leaves the visible slice as it was (or lets the lone-overflow fold
  // apply to what remains).
  const raisedIds = new Set(recent.map(entry => entry.id))
  const remaining = groups
    .map(([category, items]) => [category, items.filter(item => !raisedIds.has(item.id))] as [string, DevframeDockEntry[]])
    .filter(([, items]) => items.length > 0)

  return { ...splitGroupsWithFold(remaining, capacity), recent }
}

/** Split an edge toolbar's entries using its available main-axis space. */
export function docksSplitGroupsBySize(
  groups: DevframeDockEntriesGrouped,
  availableSize: number,
  itemSize: number,
  gap: number,
  separatorSize: number,
): SplitGroupsResult {
  const total = groups.reduce((count, [, items]) => count + items.length, 0)
  const separators = Math.max(0, groups.length - 1)
  const fullSize = total * itemSize + separators * separatorSize + Math.max(0, total + separators - 1) * gap
  if (fullSize <= availableSize)
    return { visible: groups, overflow: [], recent: [] }

  // Reserve the overflow button first. Each visible entry/divider adds its
  // size plus a gap to the button or the next entry.
  let remaining = availableSize - itemSize
  let capacity = 0
  for (const [index, [, items]] of groups.entries()) {
    if (index > 0)
      remaining -= separatorSize + gap
    const count = Math.min(items.length, Math.max(0, Math.floor(remaining / (itemSize + gap))))
    capacity += count
    remaining -= count * (itemSize + gap)
    if (count < items.length)
      break
  }
  // Preserve a lone overflow entry: folding it inline can add a category
  // divider that exceeds the measured space.
  return { ...splitGroupsAt(groups, capacity), recent: [] }
}

function resolveRecentDockEntry(
  entries: DevframeDockEntry[],
  groups: DevframeDockEntriesGrouped,
  recentId: string,
  settings: Immutable<DevframeDocksUserSettings> | undefined,
  whenContext: WhenContext | undefined,
): DevframeDockEntry | null {
  const entry = entries.find(e => e.id === recentId)
  if (!entry || entry.type === 'group')
    return null
  const group = getEntryGroup(entries, entry)
  if (group) {
    const members = getGroupMembers(entries, group.id, settings, { whenContext })
    return members.some(member => member.id === entry.id) ? entry : null
  }
  return groupsHaveEntry(groups, entry.id) ? entry : null
}

/**
 * Resolve the persisted recent-dock ids (`DockSessionStorage.recentDockIds`)
 * to the entries the float bar can raise, newest first and capped at `limit`.
 * An id is dropped when it no longer maps to a raisable entry: it was
 * unregistered, it is a group button (only concrete docks occupy a recent
 * slot), it is a grouped member hidden from its group, or it is a top-level
 * entry no longer present on the rail (hidden via user settings, `when`, or
 * `visibility`).
 */
export function resolveRecentDockEntries(options: {
  /** The raw dock entries (`context.docks.entries`). */
  entries: DevframeDockEntry[]
  /** The grouped rail items (`context.docks.groupedEntries`). */
  groups: DevframeDockEntriesGrouped
  recentIds: readonly string[] | null | undefined
  /** Maximum number of recent slots ({@link DevframeDocksUserSettings.docksRecentLimit}). */
  limit: number
  settings?: Immutable<DevframeDocksUserSettings>
  whenContext?: WhenContext
}): DevframeDockEntry[] {
  const { entries, groups, recentIds, limit, settings, whenContext } = options
  if (!recentIds || limit <= 0)
    return []
  return recentIds
    .map(id => resolveRecentDockEntry(entries, groups, id, settings, whenContext))
    .filter((entry): entry is DevframeDockEntry => entry !== null)
    .slice(0, limit)
}

/**
 * Decide which dock ids the recent slots should remember after a selection.
 *
 * The recent slots keep the docks last opened from somewhere *not* on the
 * bar (the overflow popover or a group popover) one click away:
 *
 * - A selection already reachable from the bar as rendered (a visible item,
 *   including a pinned member, or a current recent slot) leaves the list
 *   alone, so the slots never reshuffle under the cursor.
 * - Otherwise a grouped member, or a top-level entry selected from the
 *   overflow popover, moves to the front. The oldest id falls off past
 *   `limit`.
 * - Anything off the rail entirely (e.g. a built-in notice) leaves the list
 *   unchanged.
 */
export function resolveNextRecentDockIds(options: {
  /** The grouped rail items (`context.docks.groupedEntries`). */
  groups: DevframeDockEntriesGrouped
  /** The bar's inline item capacity ({@link DockLayout.maxVisibleItems}). */
  capacity: number
  /** The current recent entries, resolved via {@link resolveRecentDockEntries}. */
  recentEntries: readonly DevframeDockEntry[]
  /** The newly selected entry (post group→member resolution). */
  selected: DevframeDockEntry
  /** Whether `selected` is a member of a registered group. */
  selectedIsGroupMember: boolean
  /** Maximum number of recent slots; `0` turns the slots off. */
  limit: number
}): string[] {
  const { groups, capacity, recentEntries, selected, selectedIsGroupMember, limit } = options
  if (limit <= 0)
    return []
  const current = recentEntries.map(entry => entry.id).slice(0, limit)
  const split = docksSplitGroupsWithCapacity(groups, capacity, recentEntries)
  if (split.recent.some(entry => entry.id === selected.id) || groupsHaveEntry(split.visible, selected.id))
    return current
  if (selectedIsGroupMember || groupsHaveEntry(split.overflow, selected.id))
    return [selected.id, ...current.filter(id => id !== selected.id)].slice(0, limit)
  return current
}
