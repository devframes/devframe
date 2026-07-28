import type { ExtensionFilterItem } from './ExtensionFilter'
import { ExtensionFilter } from './ExtensionFilter'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { TextInput } from './ui/TextInput'

export interface ToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  extensions: ExtensionFilterItem[]
  onToggleExtension: (name: string) => void
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  total: number
  filtered: number
  canWrite: boolean
  onUpload: () => void
  onNewFolder: () => void
  selectedCount: number
  onBulkDelete: () => void
  onClearSelection: () => void
}

/**
 * The search box, asset count, and actions — rendered inline in the top
 * nav bar (see `App`). Swaps to a selection action bar while assets are
 * multi-selected.
 */
export function Toolbar(props: ToolbarProps) {
  if (props.selectedCount > 0) {
    return (
      <div class="flex flex-1 items-center justify-between gap-3">
        <span class="text-sm font-medium">
          {props.selectedCount}
          {' '}
          selected
        </span>
        <div class="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={props.onBulkDelete}>
            <span class="i-ph-trash-duotone" />
            {' '}
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onClearSelection}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <TextInput
        placeholder="Search assets…"
        value={props.search}
        onInput={e => props.onSearchChange((e.target as HTMLInputElement).value)}
        class="max-w-60"
      />
      <span class="op-fade whitespace-nowrap text-xs">
        {props.search ? `${props.filtered} matched · ` : ''}
        {props.total}
        {' '}
        assets
      </span>
      <span class="flex-1" />
      {props.canWrite && (
        <>
          <IconButton icon="i-ph-folder-plus-duotone" title="New folder" variant="ghost" onClick={props.onNewFolder} />
          <IconButton icon="i-ph-cloud-arrow-up-duotone" title="Upload" variant="ghost" onClick={props.onUpload} />
        </>
      )}
      <ExtensionFilter extensions={props.extensions} onToggle={props.onToggleExtension} />
      <IconButton
        icon={props.view === 'grid' ? 'i-ph-list-duotone' : 'i-ph-grid-four-duotone'}
        title="Toggle view"
        variant="ghost"
        onClick={() => props.onViewChange(props.view === 'grid' ? 'list' : 'grid')}
      />
    </div>
  )
}
