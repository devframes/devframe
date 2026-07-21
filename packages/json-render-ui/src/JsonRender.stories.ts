import type { Spec } from '@devframes/json-render'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { JsonRenderView } from './renderer'

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

export const Gallery = story({
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
})

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
