import { useEffect, useRef, useState } from 'preact/hooks'

/** A drag carries files (not a text selection or an in-page element drag). */
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Whole-frame file drag-and-drop. While `enabled`, dragging files anywhere
 * over the window flips `dragging` (for a hint overlay) and dropping them
 * hands the `FileList` to `onDrop` — no modal, no confirm step.
 */
export function useFileDrop(enabled: boolean, onDrop: (files: FileList) => void): { dragging: boolean } {
  const [dragging, setDragging] = useState(false)
  // `dragenter`/`dragleave` fire per child element as the cursor moves; a
  // depth counter keeps the hint from flickering.
  const depth = useRef(0)
  // Keep the latest callback without re-binding listeners each render.
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    if (!enabled)
      return
    function onDragEnter(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      e.preventDefault()
      depth.current++
      setDragging(true)
    }
    function onDragOver(e: DragEvent) {
      if (dragHasFiles(e))
        e.preventDefault()
    }
    function onDragLeave(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0)
        setDragging(false)
    }
    function onDropEvent(e: DragEvent) {
      if (!dragHasFiles(e))
        return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      if (e.dataTransfer?.files?.length)
        onDropRef.current(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDropEvent)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDropEvent)
    }
  }, [enabled])

  return { dragging }
}
