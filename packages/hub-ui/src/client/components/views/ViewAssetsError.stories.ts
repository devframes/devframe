import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { RemoteAssetsErrorMessage } from 'devframe/types'
import { h } from 'vue'
import ViewAssetsError from './ViewAssetsError.vue'

function error(reason: string): RemoteAssetsErrorMessage {
  return {
    type: 'devframe:remote-assets-error',
    package: '@devframes/plugin-inspect--assets',
    version: '0.9.0-beta.8',
    reason,
  }
}

function stage(children: any) {
  return h('div', { class: 'relative h-100 bg-base color-base border border-base rounded-lg overflow-hidden font-sans' }, children)
}

const meta = {
  title: 'Views/AssetsError',
  component: ViewAssetsError,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shown over an iframe view whose devframe could serve its client assets from neither a local install nor their CDN provider. The devframe\'s fallback page reports the failure over `postMessage`, and this panel offers the two ways out plus a retry.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Offline: Story = {
  render: () => ({
    setup: () => () => stage(h(ViewAssetsError, { error: error('fetch failed') })),
  }),
}

/**
 * A long provider message stays inside its own scroll area rather than
 * pushing the install command and the retry out of the panel.
 */
export const LongReason: Story = {
  render: () => ({
    setup: () => () => stage(h(ViewAssetsError, {
      error: error('Failed to fetch a remote asset of "@devframes/plugin-inspect--assets" (https://cdn.jsdelivr.net/npm/@devframes/plugin-inspect--assets@0.9.0-beta.8/dist/index.html): getaddrinfo ENOTFOUND cdn.jsdelivr.net'),
    })),
  }),
}
