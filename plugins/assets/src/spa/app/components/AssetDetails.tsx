import type { DevframeRpcClient } from 'devframe/client'
import type { ComponentChildren } from 'preact'
import type { AssetImageMeta, AssetInfo } from '../../../types'
import { useEffect, useState } from 'preact/hooks'
import { fileNameOf, formatFileSize, formatTimeAgo } from '../utils/format'
import { buildSnippets } from '../utils/snippets'
import { AssetPreview } from './AssetPreview'
import { CodeSnippets } from './CodeSnippets'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { IconButton } from './ui/IconButton'
import { TextInput } from './ui/TextInput'

export interface AssetDetailsProps {
  asset: AssetInfo
  rpc: DevframeRpcClient | null
  canWrite: boolean
  onClose: () => void
  onChanged: () => void
}

const SUPPORTS_PREVIEW = new Set(['image', 'text', 'video', 'audio', 'font'])

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

export function AssetDetails({ asset, rpc, canWrite, onClose, onChanged }: AssetDetailsProps) {
  const [imageMeta, setImageMeta] = useState<AssetImageMeta | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error', message: string } | null>(null)

  useEffect(() => {
    setImageMeta(null)
    setTextContent(null)
    setNotice(null)
    if (!rpc)
      return
    if (asset.type === 'image')
      void rpc.call('devframes:plugin:assets:read-image-meta', asset.path).then(setImageMeta)
    if (asset.type === 'text') {
      void rpc.call('devframes:plugin:assets:read-text', asset.path, 5000).then((content) => {
        setTextContent(content)
        setDraftContent(content ?? '')
      })
    }
  }, [rpc, asset.path, asset.type])

  const aspectRatio = (() => {
    if (!imageMeta?.width || !imageMeta?.height)
      return ''
    const ratio = gcd(imageMeta.width, imageMeta.height)
    return ratio > 3 ? `${imageMeta.width / ratio}:${imageMeta.height / ratio}` : ''
  })()

  const snippets = buildSnippets(asset, imageMeta)

  async function withNotice(fn: () => Promise<void>, successMessage: string): Promise<void> {
    if (!rpc)
      return
    setBusy(true)
    try {
      await fn()
      setNotice({ kind: 'success', message: successMessage })
    }
    catch (cause) {
      setNotice({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
    finally {
      setBusy(false)
    }
  }

  async function handleDelete(): Promise<void> {
    await withNotice(async () => {
      await rpc!.call('devframes:plugin:assets:delete', { paths: [asset.path] })
      setDeleteOpen(false)
      onChanged()
      onClose()
    }, 'Deleted')
  }

  async function handleRename(): Promise<void> {
    await withNotice(async () => {
      await rpc!.call('devframes:plugin:assets:rename', { path: asset.path, newName })
      setRenameOpen(false)
      onChanged()
      onClose()
    }, 'Renamed')
  }

  async function handleSaveText(): Promise<void> {
    await withNotice(async () => {
      await rpc!.call('devframes:plugin:assets:write-text', { path: asset.path, content: draftContent })
      setEditOpen(false)
      setTextContent(draftContent)
      onChanged()
    }, 'Saved')
  }

  async function handleOpenInEditor(): Promise<void> {
    await withNotice(async () => {
      await rpc!.call('devframes:plugin:assets:open-in-editor', asset.path)
    }, 'Opened in editor')
  }

  async function handleRevealInFolder(): Promise<void> {
    await withNotice(async () => {
      await rpc!.call('devframes:plugin:assets:reveal-in-folder', asset.path)
    }, 'Revealed in folder manager')
  }

  function openRenameDialog(): void {
    setNewName(fileNameOf(asset.path).replace(/\.[^./]+$/, ''))
    setRenameOpen(true)
  }

  return (
    <div class="flex min-h-full w-full flex-col gap-4 p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="truncate font-mono text-sm font-medium">{asset.path}</h2>
        <IconButton icon="i-ph-x" title="Close" variant="ghost" onClick={onClose} />
      </div>

      {SUPPORTS_PREVIEW.has(asset.type) && (
        <div class="flex items-center justify-center">
          <AssetPreview asset={asset} detail textContent={textContent} class="max-h-80 min-h-20 min-w-20 w-auto rounded border border-base" />
        </div>
      )}

      <table class="w-full table-fixed">
        <tbody>
          <Row label="Public Path">
            <div class="flex items-center gap-1 overflow-hidden">
              <a href={asset.publicPath} target="_blank" rel="noreferrer" class="flex-1 truncate font-mono text-xs color-active">{asset.publicPath}</a>
              <IconButton icon="i-ph-arrow-square-out" title="Open in browser" variant="ghost" size="sm" onClick={() => window.open(asset.publicPath, '_blank')} />
            </div>
          </Row>
          <Row label="Type">
            <span class="capitalize">{asset.type}</span>
          </Row>
          {!!imageMeta?.width && (
            <Row label="Image Size">
              {imageMeta.width}
              {' '}
              x
              {' '}
              {imageMeta.height}
            </Row>
          )}
          {!!aspectRatio && <Row label="Aspect Ratio">{aspectRatio}</Row>}
          <Row label="File Size">{formatFileSize(asset.size)}</Row>
          <Row label="Last Modified">
            {new Date(asset.mtime).toLocaleString()}
            {' '}
            <span class="op-fade">
              (
              {formatTimeAgo(asset.mtime)}
              )
            </span>
          </Row>
        </tbody>
      </table>

      <div class="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => window.open(asset.publicPath, '_blank')}>
          <span class="i-ph-download-simple-duotone" />
          {' '}
          Download
        </Button>
        <Button variant="secondary" size="sm" onClick={handleOpenInEditor} disabled={busy}>
          <span class="i-ph-code-duotone" />
          {' '}
          Open in Editor
        </Button>
        <Button variant="secondary" size="sm" onClick={handleRevealInFolder} disabled={busy}>
          <span class="i-ph-folder-open-duotone" />
          {' '}
          Reveal in Folder
        </Button>
        {canWrite && asset.type === 'text' && (
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <span class="i-ph-pencil-simple-duotone" />
            {' '}
            Edit
          </Button>
        )}
        {canWrite && (
          <Button variant="secondary" size="sm" onClick={() => openRenameDialog()}>
            <span class="i-ph-text-aa-duotone" />
            {' '}
            Rename
          </Button>
        )}
        {canWrite && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <span class="i-ph-trash-duotone" />
            {' '}
            Delete
          </Button>
        )}
      </div>

      {notice && (
        <div class={notice.kind === 'error' ? 'text-xs text-error' : 'text-xs text-success'}>{notice.message}</div>
      )}

      <div class="flex-1" />

      {snippets.length > 0 && <CodeSnippets snippets={snippets} />}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <p>
          Are you sure you want to delete
          {' '}
          <strong class="font-mono">{fileNameOf(asset.path)}</strong>
          ?
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>Delete</Button>
        </div>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)}>
        <TextInput
          value={newName}
          onInput={e => setNewName((e.target as HTMLInputElement).value)}
          placeholder="New name"
          onKeyDown={e => e.key === 'Enter' && handleRename()}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleRename} disabled={busy || !newName.trim()}>Rename</Button>
        </div>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} class="max-w-2xl">
        <textarea
          value={draftContent}
          onInput={e => setDraftContent((e.target as HTMLTextAreaElement).value)}
          class="h-80 w-full rounded border border-base bg-base p-3 font-mono text-sm outline-none"
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveText} disabled={busy}>Save</Button>
        </div>
      </Dialog>
    </div>
  )
}

function Row({ label, children }: { label: string, children: ComponentChildren }) {
  return (
    <tr>
      <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">{label}</td>
      <td class="text-sm">{children}</td>
    </tr>
  )
}
