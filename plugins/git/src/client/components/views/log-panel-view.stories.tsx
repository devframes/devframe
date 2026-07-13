import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Commit, CommitDetail } from '../../../index'
import { LogPanelView } from './log-panel-view'

const now = Date.now()

function at(minutesAgo: number): number {
  return now - minutesAgo * 60_000
}

// A small multi-branch history: `main` (current) sits on lane 0, a merge fans
// the graph into a second lane, and several branch tips / a tag carry labels.
const commits: Commit[] = [
  { hash: 'c01', shortHash: 'c01a1b2', parents: ['c02'], author: 'Ada Lovelace', email: 'ada@example.dev', date: at(8), subject: 'Optimizes CSS output', body: 'Trims unused utilities and dedupes the emitted stylesheet.', refs: ['HEAD -> main'] },
  { hash: 'c02', shortHash: 'c02b2c3', parents: ['c03'], author: 'Grace Hopper', email: 'grace@example.dev', date: at(34), subject: 'Add overflow corrector', body: 'Prepared merge preview for affected spreadsheet rows.', refs: [] },
  { hash: 'c03', shortHash: 'c03c3d4', parents: ['c04'], author: 'Lin Chen', email: 'lin@example.dev', date: at(96), subject: 'Fixes stash node icon alignment', body: 'Nudges the stash node so it lines up with commit dots.', refs: ['origin/feature/onboard'] },
  { hash: 'c04', shortHash: 'c04d4e5', parents: ['c05', 'c07'], author: 'Ada Lovelace', email: 'ada@example.dev', date: at(140), subject: 'Removes dead code', body: 'Drops the legacy graph renderer and its helpers.', refs: [] },
  { hash: 'c05', shortHash: 'c05e5f6', parents: ['c06'], author: 'Mara Singh', email: 'mara@example.dev', date: at(210), subject: 'Fix bugs in telemetry system', body: 'Guards against undefined spans during teardown.', refs: ['feature/graph'] },
  { hash: 'c06', shortHash: 'c06f607', parents: ['c08'], author: 'Lin Chen', email: 'lin@example.dev', date: at(320), subject: 'Ensures proper date ordering for Graph', body: 'Sorts commits by author date before lane assignment.', refs: [] },
  { hash: 'c07', shortHash: 'c07a708', parents: ['c08'], author: 'Grace Hopper', email: 'grace@example.dev', date: at(360), subject: 'Use gitconfig to suggest profile author and email', body: 'Reads user.name / user.email as defaults.', refs: [] },
  { hash: 'c08', shortHash: 'c08b809', parents: ['c09'], author: 'Mara Singh', email: 'mara@example.dev', date: at(540), subject: 'Log error instead of throwing', body: 'Downgrades a fatal path to a reported diagnostic.', refs: ['bug/error-log'] },
  { hash: 'c09', shortHash: 'c09c90a', parents: ['c10'], author: 'Ada Lovelace', email: 'ada@example.dev', date: at(880), subject: 'Runs yarn install after unlink', body: 'Restores dependencies once a linked package is removed.', refs: [] },
  { hash: 'c10', shortHash: 'c10d0ab', parents: ['c11'], author: 'Lin Chen', email: 'lin@example.dev', date: at(1450), subject: 'Add file-diff icons, bump component version', body: 'Ships per-status diff icons and a minor version bump.', refs: ['feature/icons'] },
  { hash: 'c11', shortHash: 'c11e1bc', parents: ['c12'], author: 'Grace Hopper', email: 'grace@example.dev', date: at(2600), subject: 'Centralize command registrations', body: 'Moves scattered command wiring into one registry.', refs: ['development'] },
  { hash: 'c12', shortHash: 'c12f2cd', parents: [], author: 'Ada Lovelace', email: 'ada@example.dev', date: at(9000), subject: 'Add type safety to date ordering', body: 'Types the comparator so bad inputs fail at compile time.', refs: ['tag: v0.1.0'] },
]

// Stand-in for the `git:show` call the live dashboard makes to fill the hover
// card. Derives plausible changed-file stats from the hash so each commit reads
// distinctly.
async function loadDetail(hash: string): Promise<CommitDetail> {
  const commit = commits.find(c => c.hash === hash)
  const seed = hash.charCodeAt(hash.length - 1)
  const additions = 20 + ((seed * 37) % 180)
  const deletions = seed % 60
  const fileCount = 1 + (seed % 4)
  return {
    isRepo: true,
    found: true,
    hash,
    shortHash: commit?.shortHash ?? hash,
    author: commit?.author ?? '',
    email: commit?.email ?? '',
    date: commit?.date ?? now,
    committer: commit?.author ?? '',
    committerEmail: commit?.email ?? '',
    commitDate: commit?.date ?? now,
    subject: commit?.subject ?? '',
    body: commit?.body ?? '',
    parents: commit?.parents ?? [],
    refs: commit?.refs ?? [],
    files: Array.from({ length: fileCount }, (_, i) => ({
      path: `src/module-${i}.ts`,
      additions: Math.round(additions / fileCount),
      deletions: Math.round(deletions / fileCount),
      binary: false,
      status: 'modified' as const,
    })),
    totalAdditions: additions,
    totalDeletions: deletions,
    patch: null,
    truncated: false,
  }
}

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
    currentBranch: 'main',
    workingChanges: 0,
    selectedHash: null,
    onRefresh: () => undefined,
    onLoadMore: () => undefined,
    onSelectCommit: () => undefined,
    onLoadDetail: loadDetail,
  },
} satisfies Meta<typeof LogPanelView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Selected: Story = { args: { selectedHash: 'c03' } }
export const WorkInProgress: Story = { args: { workingChanges: 4 } }
export const Connecting: Story = { args: { rpcConnected: false } }
export const Empty: Story = { args: { commits: [] } }
export const NotARepo: Story = { args: { isRepo: false, commits: [] } }
export const AutoLoadMore: Story = { args: { hasMore: true, loading: true } }
export const Error: Story = { args: { error: 'fatal: bad revision' } }
