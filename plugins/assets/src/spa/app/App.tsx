import type { AssetInfo } from '../../types'
import { useMemo, useState } from 'preact/hooks'
import { AssetDetails } from './components/AssetDetails'
import { AssetGrid } from './components/AssetGrid'
import { AssetTree } from './components/AssetTree'
import { DropZone } from './components/DropZone'
import { Toolbar } from './components/Toolbar'
import { Badge } from './components/ui/Badge'
import { Button } from './components/ui/Button'
import { Dialog } from './components/ui/Dialog'
import { Drawer } from './components/ui/Drawer'
import { TextInput } from './components/ui/TextInput'
import { connectionBody, connectionGlyph, connectionPanel, connectionState, connectionTitle, nav, navBrand } from './design'
import { useAssets } from './hooks/useAssets'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useUpload } from './hooks/useUpload'
import { extensionOf } from './utils/format'

type ViewMode = 'grid' | 'list'

export function App() {
  const { assets, capabilities, loading, error, isStatic, refresh, rpc } = useAssets()
  const [view, setView] = useLocalStorage<ViewMode>('devframes:plugin:assets:view', 'grid')
  const [extensionState, setExtensionState] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AssetInfo | undefined>()
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [dropzoneOpen, setDropzoneOpen] = useState(false)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const { uploading, errors: uploadErrors, uploadFiles } = useUpload(rpc, refresh)

  const canWrite = capabilities?.write ?? false

  const extensions = useMemo(() => {
    const seen = new Set<string>()
    for (const asset of assets ?? []) {
      const ext = extensionOf(asset.path)
      if (ext)
        seen.add(ext)
    }
    return Array.from(seen).sort()
  }, [assets])

  const filtered = useMemo(() => {
    const list = assets ?? []
    const query = search.trim().toLowerCase()
    return list.filter((asset) => {
      const ext = extensionOf(asset.path)
      if (ext && extensionState[ext] === false)
        return false
      if (query && !asset.path.toLowerCase().includes(query))
        return false
      return true
    })
  }, [assets, search, extensionState])

  function toggleExtension(name: string): void {
    setExtensionState(prev => ({ ...prev, [name]: prev[name] === false }))
  }

  function toggleSelect(path: string): void {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path))
        next.delete(path)
      else
        next.add(path)
      return next
    })
  }

  async function handleBulkDelete(): Promise<void> {
    if (!rpc)
      return
    await rpc.call('devframes:plugin:assets:delete', { paths: Array.from(selectedPaths) })
    setSelectedPaths(new Set())
    setBulkDeleteOpen(false)
    await refresh()
  }

  async function handleMkdir(): Promise<void> {
    if (!rpc || !newFolderName.trim())
      return
    await rpc.call('devframes:plugin:assets:mkdir', { path: newFolderName.trim() })
    setNewFolderName('')
    setMkdirOpen(false)
    await refresh()
  }

  const connState = rpc ? connectionState(rpc.status) : connectionState('connecting')

  if (connState) {
    return (
      <div class={connectionPanel('h-screen')}>
        <span class={[connectionGlyph(connState.spin), connState.icon].join(' ')} />
        <div class={connectionTitle()}>{connState.title}</div>
        <div class={connectionBody()}>{connState.body}</div>
        {connState.reloadable && (
          <Button variant="secondary" size="sm" onClick={() => location.reload()}>Reload</Button>
        )}
      </div>
    )
  }

  return (
    <div class="flex h-screen flex-col bg-base color-base">
      <header class={nav()}>
        <span class={navBrand()}>
          <span class="i-ph-image-square-duotone text-base color-active" />
          <span>Assets</span>
        </span>
        {isStatic && <Badge variant="secondary">static</Badge>}
        {!canWrite && !loading && <Badge variant="outline">read-only</Badge>}
        <span class="flex-1" />
        {error && <span class="text-xs text-error">{error}</span>}
      </header>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        extensions={extensions.map(name => ({ name, checked: extensionState[name] !== false }))}
        onToggleExtension={toggleExtension}
        view={view}
        onViewChange={setView}
        total={assets?.length ?? 0}
        filtered={filtered.length}
        canWrite={canWrite}
        onUpload={() => setDropzoneOpen(true)}
        onNewFolder={() => setMkdirOpen(true)}
        selectedCount={selectedPaths.size}
        onBulkDelete={() => setBulkDeleteOpen(true)}
        onClearSelection={() => setSelectedPaths(new Set())}
      />

      <main class="min-h-0 flex-1 overflow-auto">
        {loading
          ? <div class="flex h-full items-center justify-center op-fade text-sm">Loading assets…</div>
          : filtered.length === 0
            ? <div class="flex h-full items-center justify-center op-fade text-sm">No assets found.</div>
            : view === 'grid'
              ? (
                  <AssetGrid
                    assets={filtered}
                    selectable={canWrite}
                    selectedPaths={selectedPaths}
                    onSelectToggle={toggleSelect}
                    onSelect={setSelected}
                  />
                )
              : (
                  <AssetTree
                    assets={filtered}
                    selectedPath={selected?.path}
                    selectable={canWrite}
                    selectedPaths={selectedPaths}
                    onSelectToggle={toggleSelect}
                    onSelect={setSelected}
                  />
                )}
      </main>

      <Drawer open={!!selected} onClose={() => setSelected(undefined)}>
        {selected && (
          <AssetDetails
            asset={selected}
            rpc={rpc}
            canWrite={canWrite}
            onClose={() => setSelected(undefined)}
            onChanged={() => void refresh()}
          />
        )}
      </Drawer>

      <DropZone
        open={dropzoneOpen}
        onClose={() => setDropzoneOpen(false)}
        folder=""
        uploading={uploading}
        errors={uploadErrors}
        onUpload={uploadFiles}
      />

      <Dialog open={mkdirOpen} onClose={() => setMkdirOpen(false)}>
        <TextInput
          placeholder="Folder name"
          value={newFolderName}
          onInput={e => setNewFolderName((e.target as HTMLInputElement).value)}
          onKeyDown={e => e.key === 'Enter' && handleMkdir()}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMkdirOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleMkdir} disabled={!newFolderName.trim()}>Create</Button>
        </div>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)}>
        <p>
          Are you sure you want to delete
          {' '}
          {selectedPaths.size}
          {' '}
          asset(s)?
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleBulkDelete}>Delete</Button>
        </div>
      </Dialog>
    </div>
  )
}
