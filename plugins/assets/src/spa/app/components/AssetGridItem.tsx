import type { AssetInfo } from '../../../types'
import { AssetPreview } from './AssetPreview'
import { Checkbox } from './ui/Checkbox'

export interface AssetGridItemProps {
  asset: AssetInfo
  label: string
  selectable?: boolean
  isSelected?: boolean
  onSelectToggle?: (path: string) => void
  onClick: () => void
}

export function AssetGridItem({ asset, label, selectable, isSelected, onSelectToggle, onClick }: AssetGridItemProps) {
  return (
    <button type="button" class="relative flex flex-col items-center gap-1 overflow-hidden rounded p-2 hover:bg-active" onClick={onClick}>
      {selectable && (
        <Checkbox
          class="absolute left-1 top-1 z-1"
          checked={isSelected}
          onClick={e => e.stopPropagation()}
          onChange={() => onSelectToggle?.(asset.path)}
        />
      )}
      <AssetPreview asset={asset} class="h-30 w-30 rounded border border-base" />
      <div class="w-full truncate whitespace-nowrap text-center text-xs">{label}</div>
    </button>
  )
}
