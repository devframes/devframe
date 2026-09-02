import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { mountWithContext } from '../../stories/story-helpers'
import ViewDockRenderer from './ViewDockRenderer.vue'

// A dock type hub-ui has no native view for - it routes through the
// dock-renderer registry (e.g. a `json-render` dock).
const entry: DevframeJsonRenderDockEntry = {
  id: 'metrics',
  type: 'json-render',
  title: 'Metrics',
  icon: 'ph:cube-duotone',
  view: { stateKey: 'metrics' },
}

function stage(children: any) {
  return h('div', { class: 'h-100 bg-base color-base border border-base rounded-lg overflow-hidden font-sans' }, children)
}

const meta = {
  title: 'Views/DockRenderer',
  component: ViewDockRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Renders a non-native dock type through the hub\'s dock-renderer registry, with the missing-renderer fallback and the load-error variant (retry) when no renderer covers the type or its module fails.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

/** No renderer registered for the type - the generic fallback view. */
export const MissingRenderer: Story = {
  render: () => ({
    setup: () => mountWithContext({}, ctx =>
      stage(h(ViewDockRenderer, { context: ctx, entry }))),
  }),
}

/** The registered renderer throws at mount - the error variant with a retry. */
export const LoadError: Story = {
  render: () => ({
    setup: () => mountWithContext({}, (ctx) => {
      ctx.renderers.register('json-render', () => {
        throw new Error('Failed to fetch dynamically imported module')
      })
      return stage(h(ViewDockRenderer, { context: ctx, entry }))
    }),
  }),
}

/** A renderer is available - it owns the container (here a minimal stand-in). */
export const Mounted: Story = {
  render: () => ({
    setup: () => mountWithContext({}, (ctx) => {
      ctx.renderers.register('json-render', ({ container }) => {
        const el = document.createElement('div')
        el.textContent = 'Rendered by the registered renderer.'
        el.style.padding = '24px'
        container.append(el)
        return { dispose: () => el.remove() }
      })
      return stage(h(ViewDockRenderer, { context: ctx, entry }))
    }),
  }),
}
