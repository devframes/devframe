import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { AssetInfo } from '../../../types'
import AssetDetails from './AssetDetails.vue'

const SAMPLE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#3a6a45"/></svg>')}`

const imageAsset: AssetInfo = { path: 'icons/logo.svg', type: 'image', publicPath: SAMPLE_SVG, size: 20_480, mtime: Date.now() - 1000 * 60 * 60 * 3 }
const otherAsset: AssetInfo = { path: 'data/report.pdf', type: 'other', publicPath: '/data/report.pdf', size: 1_048_576, mtime: Date.now() - 1000 * 60 * 60 * 24 * 4 }

const meta = {
  title: 'Assets/AssetDetails',
  component: AssetDetails,
  tags: ['autodocs'],
  /**
   * No live RPC connection in Storybook - the panel renders every static
   * section; write actions are visible but no-op without a connected client.
   */
  args: { rpc: null },
  argTypes: { onClose: { action: 'close' }, onChanged: { action: 'changed' } },
} satisfies Meta<typeof AssetDetails>

export default meta
type Story = StoryObj<typeof meta>

export const Writable: Story = { args: { asset: imageAsset, canWrite: true } }
export const ReadOnly: Story = { args: { asset: imageAsset, canWrite: false } }
export const OtherType: Story = { args: { asset: otherAsset, canWrite: true } }
