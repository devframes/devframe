import type { CodeServerDetection } from '@devframes/plugin-code-server/client'
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LauncherView from './LauncherView.vue'

const localCodeServer: CodeServerDetection = {
  checked: true,
  installed: true,
  version: '4.99.0',
  bin: 'code-server',
  backend: 'code-server',
  mode: 'local',
}

const meta = {
  title: 'Code Server/LauncherView',
  component: LauncherView,
  parameters: { layout: 'fullscreen' },
  // The view is absolutely positioned; give it a full-height relative host.
  render: args => ({
    components: { LauncherView },
    setup: () => ({ args }),
    template: '<div class="relative h-100vh"><LauncherView v-bind="args" /></div>',
  }),
} satisfies Meta<typeof LauncherView>

export default meta
type Story = StoryObj<typeof meta>

/** Awaiting the devframe connection / first status. */
export const Connecting: Story = {
  args: {
    phase: 'connecting',
    detection: { checked: false, installed: false, bin: 'code-server', backend: 'code-server', mode: 'local' },
    server: { status: 'stopped' },
    busy: false,
  },
}

/** No editor binary found — install instructions and links. */
export const NotInstalled: Story = {
  args: {
    phase: 'not-installed',
    detection: { checked: true, installed: false, bin: 'code-server', backend: 'code-server', mode: 'local' },
    server: { status: 'stopped' },
    busy: false,
  },
}

/** Installed and idle — the launch screen (code-server backend). */
export const Launch: Story = {
  args: {
    phase: 'launch',
    detection: localCodeServer,
    server: { status: 'stopped' },
    busy: false,
  },
}

/** Launch screen for the Microsoft `code serve-web` backend. */
export const LaunchServeWeb: Story = {
  args: {
    phase: 'launch',
    detection: { ...localCodeServer, backend: 'code-serve-web', bin: 'code', version: '1.99.0' },
    server: { status: 'stopped' },
    busy: false,
  },
}

/** A previous launch failed — the error surfaces above the launch button. */
export const LaunchError: Story = {
  args: {
    phase: 'launch',
    detection: localCodeServer,
    server: { status: 'error', error: 'Failed to spawn the editor: EADDRINUSE 127.0.0.1:8080' },
    busy: false,
  },
}

/** Spawned, waiting on the readiness probe (and the connect handoff). */
export const Starting: Story = {
  args: {
    phase: 'starting',
    detection: localCodeServer,
    server: { status: 'starting', port: 8080 },
    busy: true,
  },
}

/** Tunnel mode, waiting on the interactive device-login prompt. */
export const TunnelLogin: Story = {
  args: {
    phase: 'starting',
    detection: { checked: true, installed: true, version: '1.99.0', bin: 'code', backend: 'code-serve-web', mode: 'tunnel' },
    server: {
      status: 'starting',
      login: { url: 'https://github.com/login/device', code: 'ABCD-1234' },
    },
    busy: true,
  },
}
