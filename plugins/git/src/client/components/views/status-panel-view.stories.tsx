import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GitStatus } from '../../../index'
import { useState } from 'react'
import { StatusPanelView } from './status-panel-view'

const dirty: GitStatus = {
  isRepo: true,
  root: '/repo',
  branch: 'feat/plugin-git',
  detached: false,
  head: 'af39698',
  upstream: 'origin/feat/plugin-git',
  ahead: 2,
  behind: 1,
  staged: [
    { path: 'src/client/components/views/log-panel-view.tsx', status: 'modified' },
    { path: 'src/client/lib/refs.ts', status: 'added' },
  ],
  unstaged: [
    { path: 'src/rpc/functions/log.ts', status: 'modified' },
    { path: 'README.md', status: 'modified' },
  ],
  untracked: ['src/client/lib/refs.test.ts'],
  clean: false,
  canWrite: true,
}

const clean: GitStatus = {
  ...dirty,
  staged: [],
  unstaged: [],
  untracked: [],
  ahead: 0,
  behind: 0,
  clean: true,
}

// Wrap so the commit textarea is interactive in Storybook.
function Harness(props: Partial<React.ComponentProps<typeof StatusPanelView>>) {
  const [message, setMessage] = useState('')
  return (
    <StatusPanelView
      data={dirty}
      loading={false}
      busy={false}
      canWrite
      message={message}
      note={null}
      onRefresh={() => undefined}
      onStage={() => undefined}
      onUnstage={() => undefined}
      onCommit={() => undefined}
      onMessageChange={setMessage}
      {...props}
    />
  )
}

const meta = {
  title: 'Panels/Status',
  component: Harness,
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Dirty: Story = {}
export const ReadOnly: Story = { args: { canWrite: false } }
export const Clean: Story = { args: { data: clean } }
export const Loading: Story = { args: { data: null, loading: true } }
export const NotARepo: Story = { args: { data: { ...clean, isRepo: false } } }
