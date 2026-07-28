import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ComponentChildren
}

/**
 * Right-hand side panel for the selected asset's details — mirrors Nuxt
 * DevTools' `NDrawer`. Uses the shared `z-drawer-*` UnoCSS layers so it
 * stacks correctly above the toolbar and grid.
 */
export function Drawer({ open, onClose, children }: DrawerProps) {
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

  return (
    <>
      <div
        class={`fixed inset-0 z-drawer-backdrop bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <div
        class={`fixed right-0 top-0 z-drawer-content h-full w-full max-w-120 border-l border-base bg-base shadow-lg transition-transform overflow-y-auto ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {open && children}
      </div>
    </>
  )
}
