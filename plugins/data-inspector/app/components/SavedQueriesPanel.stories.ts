import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { sampleFilters, sampleSaved, sampleSuggested } from './_fixtures'
import SavedQueriesPanel from './SavedQueriesPanel.vue'

const meta = {
  title: 'DataInspector/SavedQueriesPanel',
  component: SavedQueriesPanel,
  tags: ['autodocs'],
} satisfies Meta<typeof SavedQueriesPanel>

export default meta
type Story = StoryObj<typeof meta>

export const WithSavedAndSuggested: Story = {
  args: {
    saved: sampleSaved,
    suggested: sampleSuggested,
    currentQuery: 'build.modules.size()',
    currentFilters: sampleFilters,
  },
}

export const SuggestedOnly: Story = {
  args: {
    saved: [],
    suggested: sampleSuggested,
    currentQuery: 'os.platform',
    currentFilters: sampleFilters,
  },
}

export const Readonly: Story = {
  args: {
    saved: sampleSaved,
    suggested: sampleSuggested,
    currentQuery: 'build.modules.size()',
    currentFilters: sampleFilters,
    readonly: true,
  },
}
