import type { DevframeJsonRenderSpec, JsonRenderIndex, JsonRenderIndexEntry } from '@devframes/json-render'
import type { DevframeRpcClient } from 'devframe/client'
import type { Ref } from 'vue'
import type { ActionBridgeRpc } from '../action-bridge'
import { JSON_RENDER_INDEX_KEY } from '@devframes/json-render'
import { connectDevframe } from 'devframe/client'
import { computed, createApp, defineComponent, h, ref, shallowReactive, shallowRef, watch } from 'vue'
import { JsonRenderView } from '../renderer'
import { applyBranding, initColorScheme } from './theme'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
// After uno so the brand-primary override wins (see primary-ramp.css).
import './primary-ramp.css'

// Follow the host's color scheme + brand primary (both best-effort standalone).
initColorScheme()
void applyBranding()

const surface = 'flex min-h-screen items-center justify-center color-faint text-sm'

/** Subscribe to a view's live spec, keyed by `stateKey`. */
function subscribeSpec(
  rpc: DevframeRpcClient,
  stateKey: string,
  into: (spec: DevframeJsonRenderSpec | null) => void,
): void {
  void rpc.sharedState
    .get<DevframeJsonRenderSpec>(stateKey, { initialValue: null as unknown as DevframeJsonRenderSpec })
    .then((state) => {
      into(state.value() as DevframeJsonRenderSpec | null)
      state.on('updated', () => into(state.value() as DevframeJsonRenderSpec | null))
    })
}

/**
 * Single-view mode (`?view=<stateKey>`): render exactly one view, no nav — the
 * shape the hub's iframe view-provider mounts (one pooled iframe per view).
 */
function mountSingleView(root: HTMLElement, rpc: DevframeRpcClient, stateKey: string, interactive: boolean): void {
  const spec = shallowRef<DevframeJsonRenderSpec | null | undefined>(undefined)
  subscribeSpec(rpc, stateKey, s => (spec.value = s))
  const App = defineComponent({
    name: 'JsonRenderSingleView',
    setup() {
      return () => h('div', { class: 'min-h-screen bg-base color-base font-sans p6' }, [
        h(JsonRenderView, {
          spec: spec.value ?? null,
          rpc: rpc as unknown as ActionBridgeRpc,
          viewId: stateKey,
          interactive,
          loading: spec.value === undefined,
        }),
      ])
    },
  })
  createApp(App).mount(root)
}

/**
 * Dashboard mode: discover every live view from the view index and render a
 * segmented switcher. The standalone experience when no single view is pinned.
 */
function mountDashboard(root: HTMLElement, rpc: DevframeRpcClient, indexRef: Ref<JsonRenderIndex>, interactive: boolean): void {
  const App = defineComponent({
    name: 'JsonRenderSpa',
    setup() {
      const entries = computed<JsonRenderIndexEntry[]>(() =>
        Object.values(indexRef.value).sort((a, b) => a.title.localeCompare(b.title)))

      const specs = shallowReactive<Record<string, DevframeJsonRenderSpec | null | undefined>>({})
      const subscribed = new Set<string>()
      const active = ref<string | null>(null)

      watch(entries, (list) => {
        for (const entry of list) {
          if (subscribed.has(entry.stateKey))
            continue
          subscribed.add(entry.stateKey)
          specs[entry.stateKey] = undefined
          subscribeSpec(rpc, entry.stateKey, s => (specs[entry.stateKey] = s))
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

async function main(): Promise<void> {
  const root = document.getElementById('app')
  if (!root)
    throw new Error('#app mount node missing')

  const rpc = await connectDevframe()
  const interactive = rpc.connectionMeta.backend !== 'static'

  // The hub's iframe view-provider pins one view via `?view=<stateKey>`.
  const pinned = new URLSearchParams(location.search).get('view')
  if (pinned) {
    mountSingleView(root, rpc, pinned, interactive)
    return
  }

  // Dashboard: discover every live view from the single view-index shared
  // state. The author never wires a view id into the client — publishing a
  // view is enough for it to appear here.
  const indexState = await rpc.sharedState.get<JsonRenderIndex>(JSON_RENDER_INDEX_KEY, { initialValue: {} })
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

  mountDashboard(root, rpc, indexRef, interactive)
}

main().catch((error) => {
  console.error(error)
  document.body.textContent = `Failed to start: ${(error as Error).message}`
})
