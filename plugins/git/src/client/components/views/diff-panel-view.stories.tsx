import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GitDiff } from '../../../index'
import { useState } from 'react'
import { DiffPanelView, DiffPatchView } from './diff-panel-view'

const PATCH = `diff --git a/src/rpc/functions/log.ts b/src/rpc/functions/log.ts
index 1234567..89abcde 100644
--- a/src/rpc/functions/log.ts
+++ b/src/rpc/functions/log.ts
@@ -72,7 +72,7 @@ export const log = defineRpcFunction({
   name: 'devframes:plugin:git:log',
   type: 'query',
-  snapshot: true,
+  dump: async (_ctx, handler) => { /* bake head of history */ },
   jsonSerializable: true,
   setup: (ctx) => {`

const data: GitDiff = {
  isRepo: true,
  staged: false,
  path: null,
  files: [
    { path: 'src/rpc/functions/log.ts', additions: 14, deletions: 3, binary: false },
    { path: 'src/client/components/views/log-panel-view.tsx', additions: 162, deletions: 40, binary: false },
    { path: 'src/client/lib/refs.ts', additions: 71, deletions: 0, binary: false },
    { path: 'public/preview.png', additions: 0, deletions: 0, binary: true },
  ],
  totalAdditions: 247,
  totalDeletions: 43,
  patch: null,
  truncated: false,
}

// Wire the scope toggle + file selection so the panel is interactive, and feed
// the selected file's patch through the `DiffPatchView` slot.
function Harness(props: Partial<React.ComponentProps<typeof DiffPanelView>>) {
  const [staged, setStaged] = useState(false)
  const [selected, setSelected] = useState<string | null>('src/rpc/functions/log.ts')
  return (
    <DiffPanelView
      data={data}
      loading={false}
      staged={staged}
      selected={selected}
      onSelectScope={setStaged}
      onSelectFile={setSelected}
      onRefresh={() => undefined}
      patchSlot={<DiffPatchView patch={PATCH} loading={false} truncated={false} />}
      {...props}
    />
  )
}

const meta = {
  title: 'Panels/Diff',
  component: Harness,
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NoSelection: Story = { args: { selected: null } }
export const Loading: Story = { args: { data: null, loading: true } }
export const NoChanges: Story = { args: { data: { ...data, files: [], totalAdditions: 0, totalDeletions: 0 } } }
export const NotARepo: Story = { args: { data: { ...data, isRepo: false } } }
