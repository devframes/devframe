import type { Meta, StoryObj } from '@storybook/preact-vite'
import { Toolbar } from './Toolbar'

const meta: Meta<typeof Toolbar> = {
  title: 'Assets/Toolbar',
  component: Toolbar,
}
export default meta

type Story = StoryObj<typeof Toolbar>

const base = {
  search: '',
  onSearchChange: () => {},
  extensions: [
    { name: 'png', checked: true },
    { name: 'svg', checked: true },
    { name: 'mp4', checked: false },
  ],
  onToggleExtension: () => {},
  view: 'grid' as const,
  onViewChange: () => {},
  total: 42,
  filtered: 42,
  canWrite: true,
  onUpload: () => {},
  onNewFolder: () => {},
  selectedCount: 0,
  onBulkDelete: () => {},
  onClearSelection: () => {},
}

export const Default: Story = { args: base }

export const ReadOnly: Story = { args: { ...base, canWrite: false } }

export const Searching: Story = { args: { ...base, search: 'logo', filtered: 3 } }

export const SelectionMode: Story = { args: { ...base, selectedCount: 5 } }
