import type { Meta, StoryObj } from '@storybook/preact-vite'
import type { AssetInfo } from '../../../types'
import { AssetGridItem } from './AssetGridItem'

const meta: Meta<typeof AssetGridItem> = {
  title: 'Assets/AssetGridItem',
  component: AssetGridItem,
}
export default meta

type Story = StoryObj<typeof AssetGridItem>

const SAMPLE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#3a6a45"/></svg>')}`

const asset: AssetInfo = {
  path: 'icons/logo.svg',
  type: 'image',
  publicPath: SAMPLE_SVG,
  size: 4096,
  mtime: Date.now(),
}

export const Default: Story = {
  args: { asset, label: 'logo.svg', onClick: () => {} },
}

export const Selectable: Story = {
  args: { asset, label: 'logo.svg', selectable: true, onClick: () => {}, onSelectToggle: () => {} },
}

export const Selected: Story = {
  args: { asset, label: 'logo.svg', selectable: true, isSelected: true, onClick: () => {}, onSelectToggle: () => {} },
}
