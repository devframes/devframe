import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GitBranches } from '../../../index'
import { BranchesPanelView } from './branches-panel-view'

const data: GitBranches = {
  isRepo: true,
  current: 'feat/plugin-git',
  branches: [
    { name: 'feat/plugin-git', current: true, sha: 'af39698', upstream: 'origin/feat/plugin-git', subject: 'GitLens-style commit graph and log', ahead: 2, behind: 0, gone: false },
    { name: 'main', current: false, sha: '524c6b6', upstream: 'origin/main', subject: 'add dock switcher UI to minimal hub examples', ahead: 0, behind: 12, gone: false },
    { name: 'feature/onboard', current: false, sha: 'c03c3d4', upstream: 'origin/feature/onboard', subject: 'Fixes stash node icon alignment', ahead: 3, behind: 1, gone: false },
    { name: 'bug/error-log', current: false, sha: 'c08b809', upstream: null, subject: 'Log error instead of throwing', ahead: 0, behind: 0, gone: false },
    { name: 'feature/icons', current: false, sha: 'c10d0ab', upstream: 'origin/feature/icons', subject: 'Add file-diff icons, bump component version', ahead: 0, behind: 0, gone: true },
  ],
}

const meta = {
  title: 'Panels/Branches',
  component: BranchesPanelView,
  args: {
    data,
    loading: false,
    onRefresh: () => undefined,
  },
} satisfies Meta<typeof BranchesPanelView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = { args: { data: null, loading: true } }
export const NotARepo: Story = { args: { data: { isRepo: false, current: null, branches: [] } } }
