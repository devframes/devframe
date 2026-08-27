import type { DevframeViewGroup } from '@devframes/hub'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { groupedEntries } from '../../stories/fixtures'
import { mountWithContext, stage } from '../../stories/story-helpers'
import FloatingElements from '../floating/FloatingElements.vue'
import DockGroupButton from './DockGroupButton.vue'

const nuxtGroup = groupedEntries.find(e => e.id === 'nuxt') as DevframeViewGroup
const playgroundGroup = groupedEntries.find(e => e.id === 'playground') as DevframeViewGroup

function bar(children: any) {
  return h('div', { class: 'flex items-center gap-0.5 p1.5 rounded-full bg-glass border border-base shadow color-base' }, children)
}

const meta = {
  title: 'Dock/Group/Button',
  component: DockGroupButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'The dock-bar button representing a group. Clicking opens the member last opened in the group (remembered per tab), then the group\'s `defaultChildId`; with neither it reveals a popover of members. `FloatingElements` is mounted alongside so the popover renders.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

/**
 * A popover-only group (no `defaultChildId`): the first click reveals the
 * member popover. Picking a member records it as the group's last-opened
 * child, so later clicks reopen it directly.
 */
export const PopoverOnly: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: groupedEntries },
      ctx => stage([
        bar(h(DockGroupButton, {
          context: ctx,
          group: playgroundGroup,
          isVertical: false,
          selected: ctx.docks.selected,
          onSelect: (e: any) => ctx.docks.switchEntry(e?.id),
        })),
        h(FloatingElements),
      ]),
    ),
  }),
}

/**
 * A group with a `defaultChildId`: clicking opens that member straight away
 * instead of showing the popover — until another member becomes the group's
 * last-opened child, which then takes precedence.
 */
export const WithDefaultChild: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: groupedEntries },
      ctx => stage([
        bar(h(DockGroupButton, {
          context: ctx,
          group: nuxtGroup,
          isVertical: false,
          selected: ctx.docks.selected,
          onSelect: (e: any) => ctx.docks.switchEntry(e?.id),
        })),
        h(FloatingElements),
      ]),
    ),
  }),
}

/** Active state — a member of the group currently owns the panel. */
export const Active: Story = {
  render: () => ({
    setup: () => mountWithContext(
      { entries: groupedEntries, selectedId: 'nuxt:pages' },
      ctx => stage([
        bar(h(DockGroupButton, {
          context: ctx,
          group: nuxtGroup,
          isVertical: false,
          selected: ctx.docks.selected,
          onSelect: (e: any) => ctx.docks.switchEntry(e?.id),
        })),
        h(FloatingElements),
      ]),
    ),
  }),
}
