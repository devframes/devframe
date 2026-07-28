import type { AssetInfo, AssetType } from '../../types'
import { useMemo, useRef, useState } from 'preact/hooks'
import { AssetDetails } from './components/AssetDetails'
import { AssetGrid } from './components/AssetGrid'
import { AssetTree } from './components/AssetTree'
import { Toolbar } from './components/Toolbar'
import { TypeFilter } from './components/TypeFilter'
import { Badge } from './components/ui/Badge'
import { Button } from './components/ui/Button'
import { Dialog } from './components/ui/Dialog'
import { TextInput } from './components/ui/TextInput'
import { connectionBody, connectionGlyph, connectionPanel, connectionState, connectionTitle, nav, navBrand } from './design'
import { useAssets } from './hooks/useAssets'
import { useFileDrop } from './hooks/useFileDrop'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useUpload } from './hooks/useUpload'
import { ASSET_TYPES } from './utils/assetType'

type ViewMode = 'grid' | 'list'

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 900
const DEFAULT_PANEL_WIDTH = 480

export function App() {
  const { assets, capabilities, loading, error, isStatic, refresh, rpc } = useAssets()
  const [view, setView] = useLocalStorage<ViewMode>('devframes:plugin:assets:view', 'grid')
  const [panelWidth, setPanelWidth] = useLocalStorage<number>('devframes:plugin:assets:panelWidth', DEFAULT_PANEL_WIDTH)
  const [typeState, setTypeState] = useState<Partial<Record<AssetType, boolean>>>({})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AssetInfo | undefined>()
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { uploading, errors: uploadErrors, uploadFiles } = useUpload(rpc, refresh)

  const canWrite = capabilities?.write ?? false

  function uploadSelected(files: FileList): void {
    void uploadFiles(Array.from(files).map(file => ({ file, targetPath: file.name })))
  }

  const { dragging } = useFileDrop(canWrite, uploadSelected)

  function onFilePick(e: Event): void {
    const input = e.target as HTMLInputElement
    if (input.files?.length)
      uploadSelected(input.files)
    // Reset so picking the same file again still fires `change`.
    input.value = ''
  }

  function startResize(e: PointerEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidth
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    function onMove(ev: PointerEvent): void {
      // Panel is on the right, so dragging its left edge leftwards widens it.
      const next = Math.min(Math.max(startWidth + (startX - ev.clientX), MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
      setPanelWidth(next)
    }
    function onUp(): void {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Types present in the listing, with counts, in canonical display order.
  const typeItems = useMemo(() => {
    const counts = new Map<AssetType, number>()
    for (const asset of assets ?? [])
      counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1)
    return ASSET_TYPES
      .filter(type => counts.has(type))
      .map(type => ({ type, count: counts.get(type)!, checked: typeState[type] !== false }))
  }, [assets, typeState])

  const filtered = useMemo(() => {
    const list = assets ?? []
    const query = search.trim().toLowerCase()
    return list.filter((asset) => {
      if (typeState[asset.type] === false)
        return false
      if (query && !asset.path.toLowerCase().includes(query))
        return false
      return true
    })
  }, [assets, search, typeState])

  function toggleType(type: AssetType): void {
    setTypeState(prev => ({ ...prev, [type]: prev[type] === false }))
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

  const banner = error ?? (uploadErrors.length ? uploadErrors.join(' · ') : null)

  return (
    <div class="flex h-screen flex-col bg-base color-base">
      <header class={nav('gap-3')}>
        <span class={navBrand()}>
          <span class="i-ph-image-square-duotone text-base color-active" />
          <span>Assets</span>
        </span>
        {isStatic && <Badge variant="secondary">static</Badge>}
        {!canWrite && !loading && <Badge variant="outline">read-only</Badge>}
        {uploading && <Badge variant="primary">uploading…</Badge>}
        <Toolbar
          search={search}
          onSearchChange={setSearch}
          view={view}
          onViewChange={setView}
          total={assets?.length ?? 0}
          filtered={filtered.length}
          canWrite={canWrite}
          onUpload={() => fileInputRef.current?.click()}
          onNewFolder={() => setMkdirOpen(true)}
          selectedCount={selectedPaths.size}
          onBulkDelete={() => setBulkDeleteOpen(true)}
          onClearSelection={() => setSelectedPaths(new Set())}
        />
      </header>

      <TypeFilter items={typeItems} onToggle={toggleType} />

      {banner && (
        <div class="shrink-0 border-b border-base bg-error/10 px-3 py-1 text-xs text-error">{banner}</div>
      )}

      <div class="flex min-h-0 flex-1">
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

        {selected && (
          <aside
            class="relative min-h-0 shrink-0 border-l border-base bg-base"
            style={{ width: `${panelWidth}px` }}
          >
            {/* Drag handle to resize the panel. */}
            <div
              class="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-active"
              onPointerDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize details panel"
            />
            <div class="min-h-0 h-full overflow-y-auto">
              <AssetDetails
                asset={selected}
                rpc={rpc}
                canWrite={canWrite}
                onClose={() => setSelected(undefined)}
                onChanged={() => void refresh()}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Direct file picker for the Upload button — no modal. */}
      <input ref={fileInputRef} type="file" multiple class="hidden" onChange={onFilePick} />

      {/* Non-blocking hint while files are dragged over the frame. */}
      {dragging && (
        <div class="pointer-events-none fixed inset-0 z-drawer-content flex items-center justify-center bg-base/80 backdrop-blur-sm">
          <div class="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-active px-10 py-8 text-lg color-active">
            <span class="i-ph-cloud-arrow-up-duotone text-3xl" />
            <span>Drop files to upload</span>
          </div>
        </div>
      )}

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
