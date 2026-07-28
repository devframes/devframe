import type { TreeNode } from '../utils/tree'
import { useState } from 'preact/hooks'
import { TYPE_META } from '../utils/assetType'
import { Checkbox } from './ui/Checkbox'
import { Icon } from './ui/Icon'

export interface AssetListItemProps {
  node: TreeNode
  depth?: number
  selectedPath?: string
  selectable?: boolean
  selectedPaths?: Set<string>
  onSelectToggle?: (path: string) => void
  onSelect: (node: TreeNode) => void
}

export function AssetListItem({ node, depth = 0, selectedPath, selectable, selectedPaths, onSelectToggle, onSelect }: AssetListItemProps) {
  const [open, setOpen] = useState(true)
  const icon = node.isFolder ? 'i-ph-folder-duotone' : TYPE_META[node.asset?.type ?? 'other'].icon
  const isActive = !node.isFolder && node.asset?.path === selectedPath

  return (
    <div>
      <button
        type="button"
        class={`flex w-full items-center gap-2 border-b border-base px-4 py-1 text-sm hover:bg-active ${isActive ? 'bg-active' : ''}`}
        style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
        onClick={() => (node.isFolder ? setOpen(o => !o) : onSelect(node))}
      >
        {selectable && !node.isFolder && (
          <Checkbox
            checked={selectedPaths?.has(node.path)}
            onClick={e => e.stopPropagation()}
            onChange={() => onSelectToggle?.(node.path)}
          />
        )}
        <Icon name={icon} />
        <span class="flex-1 truncate text-left font-mono">{node.name}</span>
        {node.isFolder && <Icon name="i-ph-caret-right" class={`transition ${open ? 'rotate-90' : ''}`} />}
      </button>
      {node.isFolder && open && node.children.map(child => (
        <AssetListItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          selectable={selectable}
          selectedPaths={selectedPaths}
          onSelectToggle={onSelectToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
