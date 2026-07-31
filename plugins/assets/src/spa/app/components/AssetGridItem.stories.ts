import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { AssetInfo } from '../../../types'
import AssetGridItem from './AssetGridItem.vue'

const SAMPLE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#3a6a45"/></svg>')}`

const asset: AssetInfo = { path: 'icons/logo.svg', type: 'image', publicPath: SAMPLE_SVG, size: 4096, mtime: Date.now() }

const meta = {
  title: 'Assets/AssetGridItem',
  component: AssetGridItem,
  tags: ['autodocs'],
  argTypes: { onSelect: { action: 'select' }, onSelectToggle: { action: 'selectToggle' } },
} satisfies Meta<typeof AssetGridItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { asset, label: 'logo.svg' } }
export const Selectable: Story = { args: { asset, label: 'logo.svg', selectable: true } }
export const Selected: Story = { args: { asset, label: 'logo.svg', selectable: true, isSelected: true } }
