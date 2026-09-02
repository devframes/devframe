import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** A drag carries files (not a text selection or an in-page element drag). */
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Whole-frame file drag-and-drop. While `isEnabled()` returns true, dragging
 * files anywhere over the window flips `dragging` (for a hint overlay) and
 * dropping them hands the `FileList` to `onDrop` - no modal, no confirm step.
 */
export function useFileDrop(isEnabled: () => boolean, onDrop: (files: FileList) => void): { dragging: Ref<boolean> } {
  const dragging = ref(false)
  // `dragenter`/`dragleave` fire per child element as the cursor moves; a
  // depth counter keeps the hint from flickering.
  let depth = 0

  function onDragEnter(e: DragEvent): void {
    if (!isEnabled() || !dragHasFiles(e))
      return
    e.preventDefault()
    depth++
    dragging.value = true
  }
  function onDragOver(e: DragEvent): void {
    if (isEnabled() && dragHasFiles(e))
      e.preventDefault()
  }
  function onDragLeave(e: DragEvent): void {
    if (!isEnabled() || !dragHasFiles(e))
      return
    depth = Math.max(0, depth - 1)
    if (depth === 0)
      dragging.value = false
  }
  function onDropEvent(e: DragEvent): void {
    if (!isEnabled() || !dragHasFiles(e))
      return
    e.preventDefault()
    depth = 0
    dragging.value = false
    if (e.dataTransfer?.files?.length)
      onDrop(e.dataTransfer.files)
  }

  onMounted(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDropEvent)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDropEvent)
  })

  return { dragging }
}
