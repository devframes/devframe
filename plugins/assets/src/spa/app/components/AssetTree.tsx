import type { AssetInfo } from '../../../types'
import { buildTree } from '../utils/tree'
import { AssetListItem } from './AssetListItem'

export interface AssetTreeProps {
  assets: AssetInfo[]
  selectedPath?: string
  selectable: boolean
  selectedPaths: Set<string>
  onSelectToggle: (path: string) => void
  onSelect: (asset: AssetInfo) => void
}

export function AssetTree({ assets, selectedPath, selectable, selectedPaths, onSelectToggle, onSelect }: AssetTreeProps) {
  const nodes = buildTree(assets)
  return (
    <div>
      {nodes.map(node => (
        <AssetListItem
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          selectable={selectable}
          selectedPaths={selectedPaths}
          onSelectToggle={onSelectToggle}
          onSelect={n => n.asset && onSelect(n.asset)}
        />
      ))}
    </div>
  )
}
