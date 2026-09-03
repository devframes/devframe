import type { Meta, StoryObj } from '@storybook/vue3-vite'
import InstancesView from './InstancesView.vue'

const meta = {
  title: 'Inspector/InstancesView',
  component: InstancesView,
  tags: ['autodocs'],
} satisfies Meta<typeof InstancesView>

export default meta
type Story = StoryObj<typeof meta>

const now = Date.now()

export const Default: Story = {
  args: {
    instances: [
      {
        id: 'devframes_plugin_inspect',
        name: 'Devframe Inspector',
        port: 9012,
        origin: 'http://127.0.0.1:9012',
        basePath: '/',
        url: 'http://127.0.0.1:9012/',
        pid: 4821,
        rootDir: '/home/dev/projects/acme/web',
        startedAt: now - 42_000,
        hasMcp: true,
        isCurrent: true,
      },
      {
        id: 'devframes_plugin_git',
        name: 'Git',
        port: 9010,
        origin: 'http://127.0.0.1:9010',
        basePath: '/__git/',
        url: 'http://127.0.0.1:9010/__git/',
        pid: 4790,
        rootDir: '/home/dev/projects/acme/web',
        startedAt: now - 3_930_000,
        hasMcp: false,
        isCurrent: false,
      },
      {
        id: 'devframes_plugin_terminals',
        port: 9011,
        origin: 'http://127.0.0.1:9011',
        basePath: '/__terminals/',
        url: 'http://127.0.0.1:9011/__terminals/',
        pid: 4802,
        rootDir: '/home/dev/projects/other/api',
        startedAt: now - 91_000_000,
        hasMcp: true,
        isCurrent: false,
      },
    ],
  },
}

export const Loading: Story = {
  args: {
    instances: null,
  },
}

export const Empty: Story = {
  args: {
    instances: [],
  },
}
