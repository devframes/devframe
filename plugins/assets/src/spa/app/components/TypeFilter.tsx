import type { AssetType } from '../../../types'
import { TYPE_META } from '../utils/assetType'

export interface TypeFilterItem {
  type: AssetType
  count: number
  checked: boolean
}

export interface TypeFilterProps {
  items: TypeFilterItem[]
  onToggle: (type: AssetType) => void
}

/**
 * Inline row of type-filter chips — one per asset type present in the
 * listing. Modeled on vitejs/devtools' `DataSearchPanel`: a selected chip
 * reads normally, an unselected one is greyed out. Always visible (no
 * dropdown), so the active filter is self-evident.
 */
export function TypeFilter({ items, onToggle }: TypeFilterProps) {
  if (items.length <= 1)
    return null

  return (
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-base bg-secondary px-3 py-1.5">
      {items.map(({ type, count, checked }) => (
        <button
          key={type}
          type="button"
          title={`${TYPE_META[type].label} (${count})`}
          aria-pressed={checked}
          class={`flex select-none items-center gap-1.5 rounded-md border border-base px-2 py-1 text-xs transition ${checked ? 'bg-active' : 'op50 grayscale hover:op-100'}`}
          onClick={() => onToggle(type)}
        >
          <span class={TYPE_META[type].icon} />
          <span>{TYPE_META[type].label}</span>
          <span class="op-fade">{count}</span>
        </button>
      ))}
    </div>
  )
}
