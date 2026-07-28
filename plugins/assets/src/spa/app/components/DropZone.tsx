import type { QueuedFile } from '../hooks/useUpload'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { TextInput } from './ui/TextInput'

export interface DropZoneProps {
  open: boolean
  onClose: () => void
  /**
   * Whether drag-and-drop upload is active. When `false` (read-only mode)
   * the whole-frame drag listeners are never attached.
   */
  enabled: boolean
  /** Root-relative folder new uploads land in, with a trailing slash — `''` for the root. */
  folder: string
  uploading: boolean
  errors: string[]
  onUpload: (files: QueuedFile[]) => Promise<string[]>
}

/** A drag carries files (not a text selection or an in-page element drag). */
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

export function DropZone({ open, onClose, enabled, folder, uploading, errors, onUpload }: DropZoneProps) {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  // `dragenter`/`dragleave` fire per child element as the cursor moves over
  // the page; a depth counter keeps the overlay from flickering.
  const dragDepth = useRef(0)

  useEffect(() => {
    if (!enabled)
      return
    function onDragEnter(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      e.preventDefault()
      dragDepth.current++
      setDragging(true)
    }
    function onDragOver(e: DragEvent) {
      if (dragHasFiles(e))
        e.preventDefault()
    }
    function onDragLeave(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0)
        setDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      addFiles(e.dataTransfer?.files ?? null)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled])

  function addFiles(list: FileList | null): void {
    if (!list)
      return
    setFiles(prev => [...prev, ...Array.from(list)])
  }

  function handleClose(): void {
    setFiles([])
    setDragging(false)
    dragDepth.current = 0
    onClose()
  }

  function removeFile(index: number): void {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  function renameFile(index: number, newBaseName: string): void {
    setFiles((prev) => {
      const next = [...prev]
      const file = next[index]
      const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined
      const name = ext ? `${newBaseName}.${ext}` : newBaseName
      next[index] = new File([file], name, { type: file.type, lastModified: file.lastModified })
      return next
    })
  }

  async function submit(): Promise<void> {
    const failed = await onUpload(files.map(file => ({ file, targetPath: `${folder}${file.name}` })))
    if (failed.length === 0)
      handleClose()
  }

  // Visible on the explicit Upload button, while files are being dragged
  // anywhere over the frame, or once files are queued for upload.
  const visible = enabled && (open || dragging || files.length > 0)
  if (!visible)
    return null

  return (
    <div class="fixed inset-0 z-drawer-content bg-base/95 backdrop-blur-xl">
      <IconButton icon="i-ph-x" title="Close" variant="ghost" class="absolute right-5 top-5 z-1 text-xl" onClick={handleClose} />
      {files.length === 0
        ? (
            <label class="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-2xl hover:color-active">
              <span class="i-ph-cloud-arrow-up-duotone" />
              <span>Drop files here or click to select</span>
              <input type="file" multiple class="hidden" onChange={e => addFiles((e.target as HTMLInputElement).files)} />
            </label>
          )
        : (
            <div class="grid h-full grid-rows-[auto_1fr_auto]">
              <div class="px-6 py-6">
                <h1 class="text-2xl">
                  Upload to
                  {' '}
                  {folder || '/'}
                </h1>
                <p class="text-sm op-fade">Drag and drop more files, or adjust names before uploading.</p>
              </div>
              <div class="grid gap-6 overflow-auto p-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} class="flex flex-col items-center gap-2">
                    <div class="aspect-square flex w-full items-center justify-center overflow-hidden rounded-t-lg border border-base bg-active">
                      {file.type.startsWith('image/')
                        ? <img src={URL.createObjectURL(file)} class="h-full w-full object-cover" alt={file.name} />
                        : <span class="i-ph-file-duotone text-3xl op-mute" />}
                    </div>
                    <div class="flex w-full items-center gap-1">
                      <TextInput
                        value={file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name}
                        onChange={e => renameFile(i, (e.target as HTMLInputElement).value)}
                      />
                      <IconButton icon="i-ph-trash-simple" title="Remove file" variant="ghost" onClick={() => removeFile(i)} />
                    </div>
                  </div>
                ))}
              </div>
              <div class="flex flex-col items-center gap-2 p-8">
                {errors.length > 0 && (
                  <div class="text-xs text-error">
                    {errors.join(', ')}
                  </div>
                )}
                <div class="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setFiles([])}>
                    <span class="i-ph-eraser-duotone" />
                    {' '}
                    Clear
                  </Button>
                  <Button variant="primary" onClick={submit} disabled={uploading}>
                    <span class="i-ph-cloud-arrow-up-duotone" />
                    {' '}
                    {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                </div>
              </div>
            </div>
          )}
    </div>
  )
}
