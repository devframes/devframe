/**
 * Discovery `ViewModel` lifecycle bound to a Vue container ref.
 * The default page is redefined as a struct view so every result renders
 * through discovery's own page cycle (no DOM races), the color scheme follows
 * the app's, and value ANNOTATIONS badge the normalizer's type tags
 * (`{ $type: 'Map' }`, `$class`, `$ref`, ...) so exotic values read at a glance.
 */
import type { Ref, ShallowRef } from 'vue'
import type { ColorScheme } from './scheme'
import { ViewModel } from '@discoveryjs/discovery'
import discoveryCss from '@discoveryjs/discovery/dist/discovery.css?inline'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { keyBadges, objectBadges } from './display-transform'

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
`

interface AnnotationBadge {
  place: 'before' | 'after'
  style: 'badge'
  text: string
  className: string
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

export function useDiscoveryViewer(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  scheme: Ref<ColorScheme>,
  viewConfig: Record<string, unknown> = { view: 'struct', expanded: 2 },
  actions: DiscoveryQueryActions = {},
) {
  const host = shallowRef<ViewModel | null>(null)
  let pendingData: { data: unknown } | null = null

  onMounted(async () => {
    if (!container.value)
      return
    const vm = new ViewModel({
      container: container.value,
      styles: [discoveryCss, themeBridge],
      colorScheme: scheme.value,
      colorSchemePersistent: false,
    })
    vm.page.define(
      'default',
      {
        annotations: [typeAnnotation],
        ...viewConfig,
      } as never,
    )
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

  async function setData(data: unknown): Promise<void> {
    if (!host.value) {
      pendingData = { data } // render as soon as the host is ready
      return
    }
    await host.value.setData(data, { render: true })
  }

  return { setData }
}
