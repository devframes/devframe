import type { DevframeViewBuiltin } from '@devframes/hub'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { categorizedEntries, groupedEntries } from '../../stories/fixtures'
import { mountWithContext } from '../../stories/story-helpers'
import FloatingElements from '../floating/FloatingElements.vue'
import ViewBuiltinSettings from '../views-builtin/ViewBuiltinSettings.vue'
import DockEdge from './DockEdge.vue'

/** A stand-in panel body (the real one mounts iframe/custom views). */
function body(entry: any) {
  return h('div', { class: 'w-full h-full p6 font-sans color-base of-auto' }, [
    h('div', { class: 'text-lg font-medium mb2' }, entry?.title ?? 'No selection'),
    h('div', { class: 'op60 text-sm' }, `Panel content for "${entry?.id ?? '-'}"`),
  ])
}

const meta = {
  title: 'Dock/Shell/Edge Panel',
  component: DockEdge,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '520px' },
      description: {
        component: 'The edge-docked shell (edge mode): a toolbar pinned to one viewport edge with a resizable panel. The `#view` slot is stubbed here in place of the live view renderer.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

function edgeStory(position: 'top' | 'right' | 'bottom' | 'left', open = true) {
  return {
    render: () => ({
      setup: () => mountWithContext(
        {
          entries: categorizedEntries,
          selectedId: open ? 'overview' : null,
          panel: { mode: 'edge', position, height: 40, width: 30 },
          session: { open },
          /**
           * Pinned off so the toolbar stays expanded; `CollapsedIdle` below
           * covers the on-by-default auto-collapse behavior.
           */
          settings: { autoCollapseEdgeToolbar: false },
        },
        ctx => [
          h(DockEdge, { context: ctx }, { view: ({ entry }: any) => body(entry) }),
          h(FloatingElements),
        ],
      ),
    }),
  } satisfies Story
}

/** Bottom edge with the panel open. */
export const Bottom: Story = edgeStory('bottom')

/** Top edge. */
export const Top: Story = edgeStory('top')

/** Left edge, toolbar runs vertically. */
export const Left: Story = edgeStory('left')

/** Right edge. */
export const Right: Story = edgeStory('right')

/** Toolbar only, nothing selected, so the panel body is collapsed away. */
export const ToolbarOnly: Story = edgeStory('bottom', false)

/**
 * Idle-collapsed: the default `autoCollapseEdgeToolbar` with `inactiveTimeout:
 * 0` (the same trick `Dock.stories.ts`'s own `Minimized` story uses) shrinks
 * the toolbar down to a small corner pill immediately, with nothing selected.
 */
export const CollapsedIdle: Story = {
  render: () => ({
    setup: () => mountWithContext(
      {
        entries: categorizedEntries,
        selectedId: null,
        panel: { mode: 'edge', position: 'bottom', inactiveTimeout: 0 },
        session: { open: false },
      },
      ctx => [
        h(DockEdge, { context: ctx }, { view: ({ entry }: any) => body(entry) }),
        h(FloatingElements),
      ],
    ),
  }),
}

const settingsEntry: DevframeViewBuiltin = {
  type: '~builtin',
  id: '~settings',
  title: 'Settings',
  icon: 'ph:gear-duotone',
}

/**
 * Bottom edge hosting the real Settings view, whose tab content is taller than
 * the panel. Guards the panel's main-axis height chain: the other stories stub
 * `#view` with short, self-scrolling content, so they cannot catch a content
 * wrapper that grows past the panel instead of letting descendants scroll.
 */
export const BottomWithSettings: Story = {
  render: () => ({
    setup: () => mountWithContext(
      {
        entries: categorizedEntries,
        selectedId: 'overview',
        panel: { mode: 'edge', position: 'bottom', height: 40 },
      },
      ctx => [
        h(DockEdge, { context: ctx }, { view: () => h(ViewBuiltinSettings, { context: ctx, entry: settingsEntry }) }),
        h(FloatingElements),
      ],
    ),
  }),
}

/** Edge dock hosting a group; the group rail shows inside the panel. */
export const WithGroup: Story = {
  render: () => ({
    setup: () => mountWithContext(
      {
        entries: groupedEntries,
        selectedId: 'nuxt:overview',
        panel: { mode: 'edge', position: 'bottom', height: 45 },
      },
      ctx => [
        h(DockEdge, { context: ctx }, { view: ({ entry }: any) => body(entry) }),
        h(FloatingElements),
      ],
    ),
  }),
}

function patternedEdgeStory(theme: 'light' | 'dark'): Story {
  return {
    globals: { theme },
    render: () => ({
      setup: () => mountWithContext(
        {
          entries: categorizedEntries,
          selectedId: 'overview',
          panel: { mode: 'edge', position: 'bottom', height: 40, width: 30 },
          session: { open: true },
        },
        ctx => h('div', { class: 'relative w-screen h-screen overflow-hidden bg-secondary bg-grid-24' }, [
          h('div', {
            'aria-hidden': 'true',
            'class': 'pointer-events-none absolute left-[14%] top-[36%] h-72 w-72 rounded-full bg-primary-500 op40',
          }),
          h('div', {
            'aria-hidden': 'true',
            'class': 'pointer-events-none absolute right-[12%] bottom-[8%] h-40 w-72 rounded-3xl bg-active',
          }),
          h(DockEdge, { context: ctx }, { view: ({ entry }: any) => body(entry) }),
          h(FloatingElements),
        ]),
      ),
    }),
  }
}

/** Tinted glass edge material blurring a grid in light mode. */
export const GlassMaterialLight: Story = patternedEdgeStory('light')

/** Tinted glass edge material blurring a grid in dark mode. */
export const GlassMaterialDark: Story = patternedEdgeStory('dark')
