import type { AssetInfo } from '@devframes/plugin-assets/client-script'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AssetPreview from './AssetPreview.vue'

const SAMPLE_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#3a6a45"/><text x="100" y="65" fill="white" font-size="16" text-anchor="middle">logo.svg</text></svg>')}`

function asset(overrides: Partial<AssetInfo>): AssetInfo {
  return { path: 'logo.svg', type: 'image', publicPath: SAMPLE_SVG, size: 2048, mtime: Date.now(), ...overrides }
}

const meta = {
  title: 'Assets/AssetPreview',
  component: AssetPreview,
  tags: ['autodocs'],
} satisfies Meta<typeof AssetPreview>

export default meta
type Story = StoryObj<typeof meta>

const box = 'h-40 w-40 rounded border border-base'

export const Image: Story = { args: { asset: asset({}), class: box } }
export const Text: Story = {
  args: {
    asset: asset({ path: 'README.txt', type: 'text', publicPath: '/README.txt' }),
    textContent: 'This is a preview of a text asset,\ntruncated to a few hundred characters.',
    class: 'h-40 w-full rounded border border-base',
  },
}
export const TextNoContent: Story = { args: { asset: asset({ path: 'README.txt', type: 'text', publicPath: '/README.txt' }), class: box } }
export const Video: Story = { args: { asset: asset({ path: 'clip.mp4', type: 'video', publicPath: '' }), class: box } }
export const Audio: Story = { args: { asset: asset({ path: 'sound.mp3', type: 'audio', publicPath: '' }), class: box } }
export const Other: Story = { args: { asset: asset({ path: 'archive.zip', type: 'other', publicPath: '' }), class: box } }
