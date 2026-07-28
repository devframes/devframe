import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import { modalBackdrop, modalCard } from '../../design'

export interface DialogProps {
  open: boolean
  onClose: () => void
  children: ComponentChildren
  class?: string
}

/** The one shared centered confirm/edit dialog every surface uses. */
export function Dialog({ open, onClose, children, class: extra }: DialogProps) {
  useEffect(() => {
    if (!open)
      return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open)
    return null

  return (
    <div class={modalBackdrop()} onClick={onClose}>
      <div class={modalCard(extra)} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
