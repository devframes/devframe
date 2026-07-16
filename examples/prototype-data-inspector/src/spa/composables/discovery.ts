/**
 * PROTOTYPE — discovery `ViewModel` lifecycle bound to a Vue container ref.
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

// Bridge discovery's theme custom props to the design tokens (see style.css
// for the `.di-result-host` values that flip with `.dark`), zero out the
// stock page padding, and style the type badges rendered by the annotation.
const themeBridge = `
  :host {
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
    border-radius: 999px;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--di-badge-color, #888) 14%, transparent);
    border-color: color-mix(in srgb, var(--di-badge-color, #888) 32%, transparent);
    color: var(--di-badge-color, #888);
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

/** Badge the normalizer's tag objects with their type. */
function typeAnnotation(value: unknown): AnnotationBadge | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const v = value as Record<string, unknown>

  if (typeof v.$ref === 'string') {
    return { place: 'after', style: 'badge', text: 'circular', className: 'di-type-badge di-type-ref' }
  }
  if (typeof v.$type === 'string') {
    const type = v.$type
    const size = typeof v.size === 'number' ? `(${v.size})` : ''
    const kind = type === 'function'
      ? 'di-type-function'
      : type === 'Map'
        ? 'di-type-map'
        : type === 'Set'
          ? 'di-type-set'
          : type === 'Date'
            ? 'di-type-date'
            : 'di-type-other'
    const label = type === 'function' ? 'Function' : `${type}${size}`
    return { place: 'after', style: 'badge', text: label, className: `di-type-badge ${kind}` }
  }
  if (typeof v.$class === 'string') {
    return { place: 'after', style: 'badge', text: v.$class, className: 'di-type-badge di-type-class' }
  }
  return undefined
}

export function useDiscoveryViewer(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  scheme: Ref<ColorScheme>,
  viewConfig: Record<string, unknown> = { view: 'struct', expanded: 2 },
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
    vm.page.define('default', { annotations: [typeAnnotation], ...viewConfig } as never)
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
