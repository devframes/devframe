import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Commit } from '../../../index'
import { LogPanelView } from './log-panel-view'

const now = Date.now()

const commits: Commit[] = [
  { hash: 'a1b2c3d4e5f6', shortHash: 'a1b2c3d', parents: ['b2c3d4e', 'c3d4e5f'], author: 'Ada Lovelace', email: 'ada@example.dev', date: now - 36e5, subject: 'Merge branch feature/graph into main', body: '', refs: ['HEAD -> main'] },
  { hash: 'b2c3d4e', shortHash: 'b2c3d4e', parents: ['d4e5f60'], author: 'Ada Lovelace', email: 'ada@example.dev', date: now - 72e5, subject: 'Tidy up dashboard layout', body: '', refs: [] },
  { hash: 'c3d4e5f', shortHash: 'c3d4e5f', parents: ['d4e5f60'], author: 'Lin Chen', email: 'lin@example.dev', date: now - 9e6, subject: 'Add commit graph lanes', body: '', refs: ['origin/feature/graph'] },
  { hash: 'd4e5f60', shortHash: 'd4e5f60', parents: [], author: 'Ada Lovelace', email: 'ada@example.dev', date: now - 9e8, subject: 'Initial commit', body: '', refs: ['v0.1.0'] },
]

const meta = {
  title: 'Panels/Log',
  component: LogPanelView,
  args: {
    rpcConnected: true,
    isRepo: true,
    commits,
    hasMore: false,
    loading: false,
    error: null,
    liveBackend: true,
    onRefresh: () => undefined,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof LogPanelView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Connecting: Story = { args: { rpcConnected: false } }
export const Empty: Story = { args: { commits: [] } }
export const NotARepo: Story = { args: { isRepo: false, commits: [] } }
export const HasMore: Story = { args: { hasMore: true } }
export const StaticMode: Story = { args: { hasMore: true, liveBackend: false } }
export const Error: Story = { args: { error: 'fatal: bad revision' } }
