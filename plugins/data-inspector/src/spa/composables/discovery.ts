/**
 * Discovery `ViewModel` lifecycle bound to a Vue container ref.
 * The default page is redefined as a struct view so every result renders
 * through discovery's own page cycle (no DOM races), the color scheme follows
 * the app's, and value ANNOTATIONS badge the normalizer's type tags
 * (`{ $type: 'Map' }`, `$class`, `$ref`, ...) so exotic values read at a glance.
 */
import type { Ref, ShallowRef } from 'vue'
import type { NodePath } from '../../engine'
import type { ColorScheme } from './scheme'
import { ViewModel } from '@discoveryjs/discovery'
import discoveryCss from '@discoveryjs/discovery/dist/discovery.css?inline'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { decodeExpandHref, keyBadges, objectBadges, prepareForDisplay } from './display-transform'

// Bridge discovery's theme custom props to the design tokens (see style.css
// for the `.di-result-host` values that flip with `.dark`), zero out the
// stock page padding, and style the type badges rendered by the annotation.
const themeBridge = `
  :host, .discovery-root {
    --discovery-background-color: var(--di-result-bg);
    --discovery-color: var(--di-result-fg);
    --discovery-page-padding-top: 0;
    --discovery-page-padding-right: 0;
    --discovery-page-padding-bottom: 0;
    --discovery-page-padding-left: 0;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .view-struct .di-type-badge {
    font-size: 10px;
    line-height: 1.4;
    padding: 0 5px;
    border-radius: 999px !important;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--di-badge-color, #888) 14%, transparent) !important;
    border-color: color-mix(in srgb, var(--di-badge-color, #888) 32%, transparent) !important;
    color: var(--di-badge-color, #888) !important;
  }
  .di-type-function { --di-badge-color: #8a63d2; }
  .di-type-class    { --di-badge-color: #c98a1f; }
  .di-type-map      { --di-badge-color: #2f7fd0; }
  .di-type-set      { --di-badge-color: #0f9b8e; }
  .di-type-date     { --di-badge-color: #3f9c50; }
  .di-type-ref      { --di-badge-color: #c25577; }
  .di-type-other    { --di-badge-color: #7a8699; }
  .di-type-lazy     { --di-badge-color: #8a63d2; cursor: pointer; text-decoration: none; }
  .di-type-lazy::before { content: '▸ '; }
  .di-type-lazy:hover {
    background: color-mix(in srgb, var(--di-badge-color) 26%, transparent) !important;
  }
  .di-type-lazy.di-lazy-loading { cursor: progress; opacity: 0.6; }
  .di-type-lazy.di-lazy-error { --di-badge-color: #c25577; }

  /* Lazily fetched subtree, spliced in below its truncation marker. */
  .di-lazy-children {
    display: block;
    margin: 2px 0 2px 1ch;
    padding-left: 1ch;
    border-left: 1px dashed color-mix(in srgb, var(--di-result-fg, #888) 25%, transparent);
  }
  .di-lazy-children-error {
    display: block;
    margin: 2px 0 2px 1ch;
    color: #c25577;
    font-size: 11px;
  }
`

/** The element a lazily fetched subtree is inserted after (below the marker). */
function anchorLine(link: HTMLElement): HTMLElement {
  return link.closest<HTMLElement>('.value-annotations') ?? link.parentElement ?? link
}

interface AnnotationBadge {
  place: 'before' | 'after'
  style: 'badge'
  text: string
  className: string
  href?: string
  tooltip?: unknown
}

interface AnnotationContext {
  host?: unknown
  key?: string | number
}

/**
 * Badge values from the display-transform side-tables (`$class`/`$type` meta
 * is stripped from the rendered data; badges carry the type info instead).
 */
function typeAnnotation(value: unknown, context?: AnnotationContext): AnnotationBadge | undefined {
  // Object-valued entries: identity lookup.
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (typeof v.$ref === 'string')
      return { place: 'after', style: 'badge', text: '#Circular', className: 'di-type-badge di-type-ref' }
    const badge = objectBadges.get(value as object)
    if (badge)
      return { place: 'after', style: 'badge', ...badge }
    return undefined
  }
  // Primitive-valued entries (Date strings, BigInt, ...): parent+key lookup.
  const parent = context?.host
  if (parent && typeof parent === 'object' && context?.key !== undefined) {
    const badge = keyBadges.get(parent as object)?.[context.key]
    if (badge)
      return { place: 'after', style: 'badge', ...badge }
  }
  return undefined
}

export interface DiscoveryQueryActions {
  /** "Create a subquery from the path" in the struct value-actions popup. */
  onQuerySubquery?: (path: string) => void
  /** "Append path to current query" in the struct value-actions popup. */
  onQueryAppend?: (path: string) => void
}

export interface DiscoveryLazyExpand {
  /**
   * Fetch the subtree a depth-truncation marker stands in for. Returns the
   * normalized subtree (spliced in below the marker) or throws to surface the
   * failure inline.
   */
  onExpand: (path: NodePath) => Promise<unknown>
}

export function useDiscoveryViewer(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  scheme: Ref<ColorScheme>,
  viewConfig: Record<string, unknown> = { view: 'struct', expanded: 2 },
  actions: DiscoveryQueryActions = {},
  lazy?: DiscoveryLazyExpand,
) {
  const host = shallowRef<ViewModel | null>(null)
  let pendingData: { data: unknown } | null = null
  const structConfig: Record<string, unknown> = { annotations: [typeAnnotation], ...viewConfig }

  /**
   * Delegate clicks on the "load deeper" link badges the display transform
   * plants on depth-truncation markers: fetch the subtree, then render it with
   * the SAME struct config (annotations, expand depth) into a block spliced in
   * right below the marker. Nested markers carry absolute paths, so expansion
   * recurses naturally. A full `setData` re-render wipes these splices.
   */
  function wireLazyExpand(el: HTMLElement, vm: ViewModel, onExpand: (path: NodePath) => Promise<unknown>): void {
    el.addEventListener('click', (event) => {
      // Discovery renders inside a shadow root, so `event.target` is
      // retargeted to the host; walk the composed path to find the link.
      const link = event.composedPath().find(
        (node): node is HTMLAnchorElement => node instanceof HTMLElement && node.matches('a.di-type-lazy'),
      )
      if (!link)
        return
      event.preventDefault()
      event.stopPropagation()
      if (link.classList.contains('di-lazy-loading') || link.dataset.diExpanded === '1')
        return
      const path = decodeExpandHref(link.getAttribute('href') ?? '')
      if (!path)
        return

      link.classList.add('di-lazy-loading')
      void onExpand(path)
        .then((subtree) => {
          link.classList.remove('di-lazy-loading')
          link.dataset.diExpanded = '1'
          link.classList.add('di-lazy-done')
          const childrenEl = document.createElement('div')
          childrenEl.className = 'di-lazy-children'
          anchorLine(link).after(childrenEl)
          vm.view.render(childrenEl, structConfig as never, prepareForDisplay(subtree, path))
        })
        .catch((error: unknown) => {
          link.classList.remove('di-lazy-loading')
          link.classList.add('di-lazy-error')
          const errorEl = document.createElement('div')
          errorEl.className = 'di-lazy-children-error'
          errorEl.textContent = error instanceof Error ? error.message : String(error)
          anchorLine(link).after(errorEl)
        })
    })
  }

  onMounted(async () => {
    if (!container.value)
      return
    const vm = new ViewModel({
      container: container.value,
      styles: [discoveryCss, themeBridge],
      colorScheme: scheme.value,
      colorSchemePersistent: false,
    })
    vm.page.define('default', structConfig as never)
    if (lazy)
      wireLazyExpand(container.value, vm, lazy.onExpand)
    // Opting into discovery's built-in query actions makes the struct view's
    // per-value actions popup offer "query this key" entries; the callbacks
    // receive a ready-made jora path (host.pathToQuery).
    if (actions.onQuerySubquery || actions.onQueryAppend) {
      vm.action.define('queryAcceptChanges', () => true)
      if (actions.onQuerySubquery)
        vm.action.define('querySubquery', path => actions.onQuerySubquery?.(String(path)))
      if (actions.onQueryAppend)
        vm.action.define('queryAppend', path => actions.onQueryAppend?.(String(path)))
    }
    await vm.dom.ready
    host.value = vm
    if (pendingData) {
      await vm.setData(pendingData.data, { render: true })
      pendingData = null
    }
  })

  onUnmounted(() => {
    host.value = null
  })

  watch(scheme, (value) => {
    host.value?.colorScheme.set(value)
  })

  let lastData: unknown

  async function setData(data: unknown): Promise<void> {
    lastData = data
    if (!host.value) {
      pendingData = { data } // render as soon as the host is ready
      return
    }
    await host.value.setData(data, { render: true })
  }

  /**
   * Re-render the current result with a new auto-expand depth (the struct
   * view's expand-all / collapse-all). Wipes any lazily fetched splices, since
   * it is a full re-render of the base result.
   */
  async function setExpanded(depth: number): Promise<void> {
    structConfig.expanded = depth
    if (!host.value || lastData === undefined)
      return
    host.value.page.define('default', structConfig as never)
    await host.value.setData(lastData, { render: true })
  }

  return { setData, setExpanded }
}
