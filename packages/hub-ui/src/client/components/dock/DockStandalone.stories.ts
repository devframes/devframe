import type { DevframeDockEntry } from '@devframes/hub'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { mountWithContext } from '../../stories/story-helpers'
import DockStandalone from './DockStandalone.vue'

// Standalone renders the selected entry's view; use about:blank iframes so the
// shell renders without a dev server.
const blankEntries: DevframeDockEntry[] = [
  { id: 'overview', type: 'iframe', url: 'about:blank', title: 'Overview', icon: 'ph:gauge-duotone', category: 'app' },
  { id: 'routes', type: 'iframe', url: 'about:blank', title: 'Routes', icon: 'ph:signpost-duotone', category: 'app' },
  { id: 'nuxt', type: 'group', title: 'Nuxt', icon: 'logos:nuxt-icon', category: 'framework', defaultChildId: 'nuxt:overview' },
  { id: 'nuxt:overview', type: 'iframe', url: 'about:blank', title: 'Overview', icon: 'ph:gauge-duotone', groupId: 'nuxt' },
  { id: 'nuxt:pages', type: 'iframe', url: 'about:blank', title: 'Pages', icon: 'ph:files-duotone', groupId: 'nuxt' },
] as DevframeDockEntry[]

const meta = {
  title: 'Dock/Shell/Standalone',
  component: DockStandalone,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '560px' },
      description: {
        component: 'The standalone shell: a full-window sidebar + view layout (no floating dock), used when Devframes runs in its own page/window.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

/** Sidebar of tools with the first entry auto-selected. */
export const Default: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: blankEntries, clientType: 'standalone' },
      ctx => h(DockStandalone, { context: ctx }),
    ),
  }),
}

/** A group member selected - the group rail appears beside the view. */
export const WithGroup: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: blankEntries, clientType: 'standalone', selectedId: 'nuxt:overview' },
      ctx => h(DockStandalone, { context: ctx }),
    ),
  }),
}

/** Unauthorized - the standalone window shows the auth notice. */
export const Unauthorized: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: blankEntries, clientType: 'standalone', isTrusted: false },
      ctx => h(DockStandalone, { context: ctx }),
    ),
  }),
}
