/**
 * Shadows the comark-docs layer's `useFilteredNavigation` to support labeled
 * sidebar groups, restoring the grouped guide sidebar the VitePress site had.
 *
 * Groups are declared in `app.config.ts` under `docs.sidebarGroups`, keyed by
 * top-level content section; each group lists page paths (which may live in
 * other sections, e.g. the adapter pages the guide's "Mount anywhere" group
 * links to). Sections without a groups entry keep the layer's behavior: the
 * section's pages as a flat list (single-section tab) or the sections as
 * collapsible groups (multi-section tab).
 */

/** Structural mirror of comark-content's NavigationItem (avoids depending on the transitive package). */
interface NavItem {
  title: string
  path: string
  stem?: string
  children?: NavItem[]
  page?: boolean
}

interface SidebarGroup {
  title: string
  items: string[]
}

interface HeaderNavGroup {
  label: string
  sections?: string[]
}

/** Logical top-level segment of a path, ignoring the active version `base`. */
function segmentOf(path: string, base: string): string {
  const rel = base && path.startsWith(base) ? path.slice(base.length) : path
  return rel.split('/').filter(Boolean)[0] ?? ''
}

function relOf(path: string, base: string): string {
  return (base && path.startsWith(base) ? path.slice(base.length) : path) || '/'
}

export function useFilteredNavigation(): ComputedRef<NavItem[]> {
  const route = useRoute()
  const content = useDocsContent()
  const appConfig = useAppConfig()
  const navigation = inject<Ref<NavItem[]>>('navigation', ref([]))

  return computed<NavItem[]>(() => {
    const base = content.value.base
    const seg = segmentOf(route.path, base)
    const nav = navigation.value ?? []

    const headerGroups = (appConfig.header?.nav ?? []) as HeaderNavGroup[]
    const groups = headerGroups.length
      ? headerGroups
      : nav.map(item => ({ label: item.title, sections: [segmentOf(item.path, base)] }))

    const matched = groups.find(group => group.sections?.includes(seg))
    // A section reachable only through a manual tab (e.g. migrations, under the
    // version dropdown) still gets its own flat sidebar.
    if (!matched) {
      const node = nav.find(item => segmentOf(item.path, base) === seg)
      if (node)
        return (node.children ?? []).filter(child => child.path !== node.path)
    }

    const active = matched ?? groups[0]
    const sections = active?.sections
    // Manual tabs (no sections) have no content sidebar; fall back to the full tree.
    if (!sections?.length)
      return nav

    // Single-section tab with configured groups: labeled subsections.
    const sidebarGroups = (appConfig as { docs?: { sidebarGroups?: Record<string, SidebarGroup[]> } })
      .docs
      ?.sidebarGroups
    const groupsConfig = sections.length === 1 ? sidebarGroups?.[sections[0]!] : undefined
    if (groupsConfig) {
      // Index every page by base-relative path, preferring leaf pages over
      // section nodes (a section node carries the directory title).
      const byPath = new Map<string, NavItem>()
      const walk = (items: NavItem[]): void => {
        for (const item of items) {
          if (item.page !== false) {
            const rel = relOf(item.path, base)
            const existing = byPath.get(rel)
            if (!existing || (existing.children?.length && !item.children?.length))
              byPath.set(rel, item)
          }
          if (item.children)
            walk(item.children)
        }
      }
      walk(nav)

      const used = new Set<string>()
      const grouped: NavItem[] = []
      for (const [index, group] of groupsConfig.entries()) {
        const children = group.items
          .map((path) => {
            used.add(path)
            return byPath.get(path)
          })
          .filter(child => child !== undefined)
          .map(child => ({ ...child, children: undefined }))
        if (!children.length)
          continue
        grouped.push({
          title: group.title,
          path: `${base}/${sections[0]}-group-${index}`,
          children,
          page: false,
        })
      }

      // Append pages the groups don't cover, so a new page never vanishes.
      const node = nav.find(item => segmentOf(item.path, base) === sections[0])
      const leftovers = (node?.children ?? [])
        .filter(child => !used.has(relOf(child.path, base)))
      return [...grouped, ...leftovers]
    }

    // Single-section tab: that section's children as a flat tree.
    if (sections.length === 1) {
      const node = nav.find(item => segmentOf(item.path, base) === sections[0])
      return (node?.children ?? []).filter(child => child.path !== node?.path)
    }

    // Multi-section tab: the sections as collapsible groups.
    return nav.filter(item => sections.includes(segmentOf(item.path, base)))
  })
}
