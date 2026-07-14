import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CommitDetail } from '../../../index'
import { CommitDetailsView } from './commit-details-view'

const now = Date.now()

const PATCH = `diff --git a/src/client/components/views/log-panel-view.tsx b/src/client/components/views/log-panel-view.tsx
index 1234567..89abcde 100644
--- a/src/client/components/views/log-panel-view.tsx
+++ b/src/client/components/views/log-panel-view.tsx
@@ -300,12 +300,9 @@ export function LogPanelView(props: LogPanelViewProps) {
-      {isRepo === true && hasMore && (
-        <Button variant="outline" size="sm" onClick={onLoadMore}>Load more</Button>
-      )}
+      {hasMore && (
+        <div ref={sentinelRef}>Loading more…</div>
+      )}
diff --git a/src/client/components/log-panel.tsx b/src/client/components/log-panel.tsx
index 2345678..9abcdef 100644
--- a/src/client/components/log-panel.tsx
+++ b/src/client/components/log-panel.tsx
@@ -12,7 +12,6 @@ export function LogPanel({ branch }: LogPanelProps) {
   const sentinelRef = useRef<HTMLDivElement>(null)
-  const [loadingMore, setLoadingMore] = useState(false)
   useIntersectionObserver(sentinelRef, onLoadMore)
diff --git a/public/preview.png b/public/preview.png
index 3456789..0abcdef 100644
Binary files a/public/preview.png and b/public/preview.png differ`

const detail: CommitDetail = {
  isRepo: true,
  found: true,
  hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  shortHash: 'a1b2c3d',
  author: 'Ada Lovelace',
  email: 'ada@example.dev',
  date: now - 36e5,
  committer: 'Ada Lovelace',
  committerEmail: 'ada@example.dev',
  commitDate: now - 36e5,
  subject: 'Auto-load commits on scroll instead of a Load more button',
  body: 'Replaces the manual pagination control with an IntersectionObserver\nsentinel so history streams in as the user scrolls.',
  parents: ['b2c3d4e5f6a7b8c9'],
  refs: ['HEAD -> main', 'origin/main'],
  files: [
    { path: 'src/client/components/views/log-panel-view.tsx', additions: 41, deletions: 18, binary: false, status: 'modified' },
    { path: 'src/client/components/log-panel.tsx', additions: 6, deletions: 1, binary: false, status: 'added' },
    { path: 'public/preview.png', additions: 0, deletions: 0, binary: true, status: 'added' },
  ],
  totalAdditions: 47,
  totalDeletions: 19,
  patch: PATCH,
  truncated: false,
}

const meta = {
  title: 'Panels/CommitDetails',
  component: CommitDetailsView,
  args: {
    data: detail,
    loading: false,
    error: null,
    onClose: () => undefined,
  },
} satisfies Meta<typeof CommitDetailsView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Loading: Story = { args: { data: null, loading: true } }
export const StaticNoPatch: Story = { args: { data: { ...detail, patch: null } } }
export const NotFound: Story = { args: { data: { ...detail, found: false } } }
export const Error: Story = { args: { data: null, error: 'fatal: bad object deadbeef' } }
