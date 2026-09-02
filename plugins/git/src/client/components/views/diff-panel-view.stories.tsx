import type { GitDiff } from '@devframes/service-git'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import type { BundledLanguage } from 'shiki'
import type { ConnectionState } from '../rpc-provider'
import { useState } from 'react'
import { codeToTokens } from 'shiki'
import { DiffPatchView } from '../diff/diff-view'
import { RpcContext } from '../rpc-provider'
import { DiffPanelView } from './diff-panel-view'

const PATCH = `diff --git a/src/rpc/functions/log.ts b/src/rpc/functions/log.ts
index 1234567..89abcde 100644
--- a/src/rpc/functions/log.ts
+++ b/src/rpc/functions/log.ts
@@ -72,4 +72,4 @@ export const log = defineRpcFunction({
   name: 'devframes:service:git:log',
   type: 'query',
-  snapshot: true,
+  dump: async (_ctx, handler) => { /* bake head of history */ },
   jsonSerializable: true,`

// Storybook has no host, so stand up a mock `@devframes/service-shiki` handle
// that highlights in-browser with the real Shiki - the diff stories then render
// true syntax colors through the same code path production uses.
async function mockCodeToTokens({ code, lang, themes }: { code: string, lang?: string, themes?: { light: string, dark: string } }) {
  const pair = themes ?? { light: 'vitesse-light', dark: 'vitesse-dark' }
  try {
    return await codeToTokens(code, { lang: (lang ?? 'text') as BundledLanguage, themes: pair })
  }
  catch {
    return await codeToTokens(code, { lang: 'text' as BundledLanguage, themes: pair })
  }
}

// Storybook mock: only the shiki service handle off `rpc.services` is exercised,
// so the full DevframeRpcClient surface is intentionally stubbed out.
// eslint-disable-next-line slop/no-chained-type-assertions -- minimal RPC mock for a story
const mockConnection = {
  rpc: {
    services: {
      has: () => true,
      get: (pkg: string) => (pkg === '@devframes/service-shiki'
        ? { scope: 'devframes:service:shiki', rpc: { call: (_name: string, input: Parameters<typeof mockCodeToTokens>[0]) => mockCodeToTokens(input) } }
        : undefined),
    },
  },
  status: 'connected',
  error: null,
} as unknown as ConnectionState

function WithMockRpc({ children }: { children: ReactNode }) {
  return <RpcContext value={mockConnection}>{children}</RpcContext>
}

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
    <WithMockRpc>
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
    </WithMockRpc>
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
