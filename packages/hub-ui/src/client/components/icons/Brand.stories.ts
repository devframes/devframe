import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, onScopeDispose } from 'vue'
import { setBranding } from '../../state/branding'
import BrandMark from './BrandMark.vue'
import BrandWordmark from './BrandWordmark.vue'

// A stand-in consumer logo (inline data-URI SVG) so the branded stories need no
// network. A violet hexagon, echoing the sample `primaryColor` below.
const SAMPLE_LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#7c3aed" d="M12 2l9 5v10l-9 5-9-5V7z"/></svg>`,
)}`

const meta = {
  title: 'Brand/Logos',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'The Devframes brand marks used across the dock and standalone shells.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

/** The Devframes mark (the minimized dock nub / auth screen logo). */
export const Mark: Story = {
  name: 'BrandMark',
  render: () => ({ setup: () => () => h('div', { class: 'w-24 h-24' }, h(BrandMark)) }),
}

/** The Devframes wordmark (recolors with the theme). */
export const Wordmark: Story = {
  name: 'BrandWordmark',
  render: () => ({ setup: () => () => h(BrandWordmark) }),
}

/**
 * A rebrand via `createUi({ branding })` / the host page - a custom product
 * name, logo, and primary color. The wrapper sets `--devframe-primary` (what
 * the bootstrap applies from `branding.primaryColor`), so the ramp - and the
 * mark/wordmark - retint together.
 */
export const Branded: Story = {
  name: 'Branded (custom)',
  render: () => ({
    setup() {
      setBranding({ productName: 'Acme DevTools', logo: SAMPLE_LOGO, primaryColor: '#7c3aed' })
      // Restore devframe defaults so sibling stories are unaffected.
      onScopeDispose(() => setBranding({}))
      return () => h('div', { class: 'devframes-accent-scope flex flex-col gap-4 p-6', style: '--devframe-primary: #7c3aed' }, [
        h('div', { class: 'w-16 h-16' }, h(BrandMark)),
        h(BrandWordmark),
        h('div', { class: 'flex items-center gap-3' }, [
          h('button', { class: 'btn-primary' }, 'Primary button'),
          h('span', { class: 'color-active font-medium' }, 'color-active text'),
        ]),
      ])
    },
  }),
}
