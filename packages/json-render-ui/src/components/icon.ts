import type { JrComponent } from './_shared'
import DOMPurify from 'dompurify'
import { defineComponent, h, ref, watchEffect } from 'vue'

const ICONIFY_API = 'https://api.iconify.design'
// Sanitize the spec-supplied name before it reaches a URL: Iconify names are
// `prefix:icon`, lowercase alphanumerics plus `-`/`:`.
const SAFE_NAME = /^[a-z0-9]+:[a-z0-9-]+$/

const cache = new Map<string, Promise<string | null>>()

async function fetchIcon(name: string): Promise<string | null> {
  if (!SAFE_NAME.test(name))
    return null
  let promise = cache.get(name)
  if (!promise) {
    const [prefix, icon] = name.split(':')
    promise = fetch(`${ICONIFY_API}/${prefix}/${icon}.svg`)
      .then(r => (r.ok ? r.text() : null))
      .then(svg => (svg ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) : null))
      .catch(() => null)
    cache.set(name, promise)
  }
  return promise
}

/**
 * Fully dynamic icon: resolves whatever (sanitized) icon name a spec supplies
 * at runtime from the Iconify API, with no bundled/preferred set. A deliberate,
 * documented deviation from the repo's Phosphor-first convention — that applies
 * to a surface's own chrome, not to spec-driven content icons.
 */
const IconImpl = defineComponent({
  name: 'JsonRenderIcon',
  props: {
    name: { type: String, default: '' },
    size: { type: Number, default: 16 },
  },
  setup(props) {
    const svg = ref<string | null>(null)
    watchEffect(async () => {
      svg.value = props.name ? await fetchIcon(props.name) : null
    })
    return () => h('span', {
      'class': 'inline-flex items-center justify-center color-base',
      'style': { width: `${props.size}px`, height: `${props.size}px` },
      'role': 'img',
      'aria-label': props.name,
      'innerHTML': svg.value ?? '',
    })
  },
})

interface IconProps { name?: string, size?: number }

export const Icon: JrComponent<IconProps> = ({ props }) =>
  h(IconImpl, { name: props.name ?? '', size: props.size ?? 16 })
