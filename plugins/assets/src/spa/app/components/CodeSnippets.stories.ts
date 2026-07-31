import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CodeSnippets from './CodeSnippets.vue'

const meta = {
  title: 'Assets/CodeSnippets',
  component: CodeSnippets,
  tags: ['autodocs'],
} satisfies Meta<typeof CodeSnippets>

export default meta
type Story = StoryObj<typeof meta>

export const ImageAsset: Story = {
  args: {
    snippets: [
      { name: 'Image tag', lang: 'html', code: '<img src="/logo.svg" width="200" height="200" />' },
      { name: 'CSS background', lang: 'css', code: '.element {\n  background-image: url(\'/logo.svg\');\n}' },
      { name: 'Download link', lang: 'html', code: '<a href="/logo.svg" download>\n  Download logo.svg\n</a>' },
    ],
  },
}

export const FontAsset: Story = {
  args: {
    snippets: [
      { name: '@font-face', lang: 'css', code: '@font-face {\n  font-family: \'brand\';\n  src: url(\'/brand.woff2\');\n}' },
      { name: 'Download link', lang: 'html', code: '<a href="/brand.woff2" download>\n  Download brand.woff2\n</a>' },
    ],
  },
}
