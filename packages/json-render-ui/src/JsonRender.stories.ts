import type { Spec } from '@devframes/json-render'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { baseRegistry } from './registry'
import { JsonRenderView } from './renderer'
import jsonRenderDockRenderer from './renderer-module'

// A no-op RPC — stories don't dispatch real actions.
const rpc = { call: async () => undefined }

function story(spec: Spec, extra: Record<string, unknown> = {}): StoryObj {
  return {
    render: () => ({
      setup: () => () => h(JsonRenderView, { spec, rpc, ...extra }),
    }),
  }
}

const meta: Meta = {
  title: 'JsonRender',
}
export default meta

const gallerySpec: Spec = {
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 12 }, children: ['title', 'row', 'card', 'progress', 'table', 'tree'] },
    title: { type: 'Text', props: { text: 'JSON-render gallery', variant: 'heading' }, children: [] },
    row: { type: 'Stack', props: { direction: 'row', gap: 8 }, children: ['b1', 'b2', 'badge'] },
    b1: { type: 'Button', props: { label: 'Primary', variant: 'primary' }, children: [] },
    b2: { type: 'Button', props: { label: 'Ghost', variant: 'ghost', icon: 'plus' }, children: [] },
    badge: { type: 'Badge', props: { text: 'success', variant: 'success' }, children: [] },
    card: { type: 'Card', props: { title: 'Details', collapsible: true }, children: ['kv'] },
    kv: { type: 'KeyValueTable', props: { data: { name: 'devframe', version: '0.7.5' } }, children: [] },
    progress: { type: 'Progress', props: { value: 62, max: 100, label: 'Coverage' }, children: [] },
    table: { type: 'DataTable', props: { rows: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }, children: [] },
    tree: { type: 'Tree', props: { data: { a: 1, b: [true, 'x'] } }, children: [] },
  },
}

export const Gallery = story(gallerySpec)

export const Controls = story({
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 12 }, children: ['input', 'toggle', 'divider', 'code'] },
    input: { type: 'TextInput', props: { label: 'Name', placeholder: 'Type…', value: { $bindState: '/name' } }, children: [] },
    toggle: { type: 'Switch', props: { label: 'Enabled', value: { $bindState: '/enabled' } }, children: [] },
    divider: { type: 'Divider', props: { label: 'code' }, children: [] },
    code: { type: 'CodeBlock', props: { filename: 'hello.ts', language: 'ts', code: 'export const x = 1' }, children: [] },
  },
  state: { name: '', enabled: true },
})

export const Loading: StoryObj = story({ root: 'a', elements: { a: { type: 'Text', props: {}, children: [] } } }, { loading: true })

export const ConnectionError: StoryObj = story(
  { root: 'a', elements: { a: { type: 'Text', props: {}, children: [] } } },
  { connectionError: 'Disconnected from server' },
)

export const StaticOutput: StoryObj = story(
  {
    root: 'root',
    elements: {
      root: { type: 'Stack', props: { gap: 8 }, children: ['btn'] },
      btn: { type: 'Button', props: { label: 'Run', variant: 'primary' }, children: [] },
    },
  },
  { interactive: false },
)

export const InvalidElement: StoryObj = story({
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 8 }, children: ['ok', 'bad'] },
    ok: { type: 'Text', props: { text: 'valid' }, children: [] },
    bad: { type: 'Badge', props: { variant: 'purple' }, children: [] },
  },
})

// An element whose `type` is absent from the registry renders behind the
// unsupported placeholder (type + prop-keys gist), while its siblings render.
export const UnsupportedComponent: StoryObj = story({
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 8 }, children: ['ok', 'chart', 'more'] },
    ok: { type: 'Text', props: { text: 'This view uses a component the frontend does not ship.' }, children: [] },
    chart: { type: 'Fancy3DChart', props: { data: [1, 2, 3], title: 'Revenue', animate: true }, children: [] },
    more: { type: 'Badge', props: { text: 'still renders', variant: 'success' }, children: [] },
  },
})

// A frontend that supports only a subset of the catalog: rendering with a
// registry missing `DataTable` placeholders that element, everything else
// renders normally.
const { DataTable: _omitted, ...subsetRegistry } = baseRegistry as Record<string, unknown>
export const SubsetRegistry: StoryObj = story(
  {
    root: 'root',
    elements: {
      root: { type: 'Stack', props: { gap: 8 }, children: ['title', 'table'] },
      title: { type: 'Text', props: { text: 'Registry without DataTable', variant: 'heading' }, children: [] },
      table: { type: 'DataTable', props: { rows: [{ id: 1, name: 'a' }], height: 120 }, children: [] },
    },
  },
  { registry: subsetRegistry },
)

const dockRendererContext = {
  rpc: { call: rpc.call, connectionMeta: undefined },
} as unknown as Parameters<typeof jsonRenderDockRenderer>[0]['context']

/** Mounts the shipped dock renderer so the story exercises its shadow root and adopted stylesheet. */
export const InShadowRoot: StoryObj = {
  render: () => ({
    setup() {
      const host = useTemplateRef<HTMLDivElement>('host')
      let dispose: (() => void) | undefined
      let mountToken = 0
      onMounted(async () => {
        const token = ++mountToken
        const instance = await jsonRenderDockRenderer({
          entry: {
            id: 'story',
            title: 'Story',
            icon: 'ph:cube-duotone',
            type: 'json-render',
            view: { spec: gallerySpec },
          },
          container: host.value!,
          context: dockRendererContext,
        })
        if (token !== mountToken) {
          instance.dispose?.()
          return
        }
        dispose = instance.dispose
      })
      onUnmounted(() => {
        mountToken++
        dispose?.()
      })
      return () => h('div', { ref: 'host', class: 'w-full h-80 rounded-lg bg-grid' })
    },
  }),
}
