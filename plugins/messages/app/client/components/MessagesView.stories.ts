import type { DevframeMessageEntry } from '@devframes/hub/types'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { useMessageFilters } from '../composables/useMessageFilters'
import { makeSampleEntries } from './_fixtures'
import MessagesView from './MessagesView.vue'

// The view is driven by the shared `filters` façade (owned by `App.vue` in the
// real app); each story seeds one from a fixed entry list.
interface StoryArgs {
  entries: DevframeMessageEntry[]
  canOpenFile?: boolean
}

const meta = {
  title: 'Messages/MessagesView',
  component: MessagesView,
  tags: ['autodocs'],
  render: (args: StoryArgs) => ({
    components: { MessagesView },
    setup() {
      const filters = useMessageFilters(() => args.entries)
      return { filters, args }
    },
    template: '<div class="h-120 bg-base color-base"><MessagesView :filters="filters" :can-open-file="args.canOpenFile" /></div>',
  }),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    entries: makeSampleEntries(),
    canOpenFile: true,
  },
}

export const Empty: Story = {
  args: {
    entries: [],
  },
}

export const StaticBackend: Story = {
  args: {
    entries: makeSampleEntries(),
    canOpenFile: false,
  },
}
