import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { Icon } from './ui/Icon'

export interface SectionBlockProps {
  title: string
  description?: string
  defaultOpen?: boolean
  children: ComponentChildren
}

/** Collapsible folder-group header, mirroring Nuxt DevTools' `NSectionBlock`. */
export function SectionBlock({ title, description, defaultOpen = true, children }: SectionBlockProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div class="border-b border-base last:border-b-0">
      <button type="button" class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-active" onClick={() => setOpen(o => !o)}>
        <Icon name="i-ph-caret-right" class={`transition ${open ? 'rotate-90' : ''}`} />
        <span class="font-mono text-sm">{title}</span>
        {description && <span class="text-xs op-fade">{description}</span>}
      </button>
      {open && <div class="px-2 pb-2">{children}</div>}
    </div>
  )
}
