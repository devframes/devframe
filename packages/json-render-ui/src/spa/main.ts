import type { DevframeJsonRenderSpec, JsonRenderIndex, JsonRenderIndexEntry } from '@devframes/json-render'
import type { ActionBridgeRpc } from '../action-bridge'
import { JSON_RENDER_INDEX_KEY } from '@devframes/json-render'
import { connectDevframe } from 'devframe/client'
import { computed, createApp, defineComponent, h, ref, shallowReactive, shallowRef, watch } from 'vue'
import { JsonRenderView } from '../renderer'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const surface = 'flex min-h-screen items-center justify-center color-faint text-sm'

async function main(): Promise<void> {
  const root = document.getElementById('app')
  if (!root)
    throw new Error('#app mount node missing')

  const rpc = await connectDevframe()
  const interactive = rpc.connectionMeta.backend !== 'static'

  // Discover every live view from the single view-index shared state, then
  // subscribe to each view's own state. The author never wires a view id into
  // the client — publishing a view is enough for it to appear here.
  const indexState = await rpc.sharedState.get<JsonRenderIndex>(JSON_RENDER_INDEX_KEY, { initialValue: {} })
  // Seed the current server value before mounting so an empty tree isn't
  // mistaken for "no views" during the first round-trip.
  if (interactive) {
    try {
      const value = await rpc.call('devframe:rpc:server-state:get', JSON_RENDER_INDEX_KEY)
      if (value && typeof value === 'object')
        indexState.mutate(() => value as JsonRenderIndex)
    }
    catch {
      // Non-fatal: fall back to live 'updated' events below.
    }
  }

  const indexRef = shallowRef<JsonRenderIndex>(indexState.value() as JsonRenderIndex)
  indexState.on('updated', () => {
    indexRef.value = indexState.value() as JsonRenderIndex
  })

  const App = defineComponent({
    name: 'JsonRenderSpa',
    setup() {
      const entries = computed<JsonRenderIndexEntry[]>(() =>
        Object.values(indexRef.value).sort((a, b) => a.title.localeCompare(b.title)))

      // Per-view specs, keyed by stateKey. `undefined` = subscribing (loading),
      // `null` = subscribed with no spec yet.
      const specs = shallowReactive<Record<string, DevframeJsonRenderSpec | null | undefined>>({})
      const subscribed = new Set<string>()
      const active = ref<string | null>(null)

      watch(entries, (list) => {
        for (const entry of list) {
          if (subscribed.has(entry.stateKey))
            continue
          subscribed.add(entry.stateKey)
          specs[entry.stateKey] = undefined
          void rpc.sharedState
            .get<DevframeJsonRenderSpec>(entry.stateKey, { initialValue: null as unknown as DevframeJsonRenderSpec })
            .then((state) => {
              specs[entry.stateKey] = state.value() as DevframeJsonRenderSpec | null
              state.on('updated', () => {
                specs[entry.stateKey] = state.value() as DevframeJsonRenderSpec | null
              })
            })
        }
        if (!active.value || !list.some(e => e.stateKey === active.value))
          active.value = list[0]?.stateKey ?? null
      }, { immediate: true })

      function renderTabs(list: JsonRenderIndexEntry[]) {
        return h('div', { class: 'inline-flex gap-1 rounded bg-secondary p1 text-sm' }, list.map(entry =>
          h('button', {
            'key': entry.stateKey,
            'type': 'button',
            'data-state': active.value === entry.stateKey ? 'active' : 'inactive',
            'class': [
              'rounded px3 py1 transition-colors',
              active.value === entry.stateKey
                ? 'bg-base color-base shadow-sm'
                : 'color-muted hover:color-base',
            ],
            'onClick': () => { active.value = entry.stateKey },
          }, entry.title)))
      }

      return () => {
        const list = entries.value
        if (!list.length)
          return h('div', { class: surface }, 'No JSON-render views registered.')

        const activeEntry = list.find(e => e.stateKey === active.value) ?? list[0]
        const spec = specs[activeEntry.stateKey]

        // A single view renders on its own — no nav. The top bar (brand +
        // segmented view switcher) only appears once there's more than one.
        const multiple = list.length > 1

        return h('div', { class: 'min-h-screen bg-base color-base font-sans' }, [
          multiple
            ? h('div', {
                class: 'flex items-center gap-3 border-b border-base px5 h-nav',
              }, [
                h('div', { class: 'flex items-center gap-2 font-medium' }, [
                  h('div', { class: 'i-ph:layout-duotone color-primary text-lg' }),
                  h('span', 'JSON Render'),
                ]),
                h('div', { class: 'ml-auto' }, [renderTabs(list)]),
              ])
            : null,
          h('div', { class: 'p6' }, [
            h(JsonRenderView, {
              spec: spec ?? null,
              rpc: rpc as unknown as ActionBridgeRpc,
              viewId: activeEntry.stateKey,
              upstreamVersion: activeEntry.upstreamVersion,
              interactive,
              loading: spec === undefined,
            }),
          ]),
        ])
      }
    },
  })

  createApp(App).mount(root)
}

main().catch((error) => {
  console.error(error)
  document.body.textContent = `Failed to start: ${(error as Error).message}`
})
