import { useState } from 'preact/hooks'
import { Checkbox } from './ui/Checkbox'
import { IconButton } from './ui/IconButton'

export interface ExtensionFilterItem {
  name: string
  checked: boolean
}

export interface ExtensionFilterProps {
  extensions: ExtensionFilterItem[]
  onToggle: (name: string) => void
}

export function ExtensionFilter({ extensions, onToggle }: ExtensionFilterProps) {
  const [open, setOpen] = useState(false)
  if (extensions.length === 0)
    return null

  return (
    <div class="relative">
      <IconButton icon="i-ph-funnel-duotone" title="Filter by extension" variant="ghost" onClick={() => setOpen(o => !o)} />
      {open && (
        <>
          <div class="fixed inset-0 z-dropdown" onClick={() => setOpen(false)} />
          <div class="absolute right-0 top-full z-dropdown mt-1 flex max-h-60 w-40 flex-col gap-1 overflow-auto rounded-lg border border-base bg-base p-2 shadow-lg">
            {extensions.map(ext => (
              <label key={ext.name} class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-active">
                <Checkbox checked={ext.checked} onChange={() => onToggle(ext.name)} />
                <span class="op-fade">{ext.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
