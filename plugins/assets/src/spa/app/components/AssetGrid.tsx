import type { AssetInfo } from '../../../types'
import { groupByFolder } from '../utils/tree'
import { AssetGridItem } from './AssetGridItem'
import { SectionBlock } from './SectionBlock'

export interface AssetGridProps {
  assets: AssetInfo[]
  selectable: boolean
  selectedPaths: Set<string>
  onSelectToggle: (path: string) => void
  onSelect: (asset: AssetInfo) => void
}

function Grid({ items, folder, ...rest }: { items: AssetInfo[], folder?: string } & Pick<AssetGridProps, 'selectable' | 'selectedPaths' | 'onSelectToggle' | 'onSelect'>) {
  return (
    <div class="grid gap-2 p-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }}>
      {items.map(asset => (
        <AssetGridItem
          key={asset.path}
          asset={asset}
          label={folder ? asset.path.slice(folder.length) : asset.path}
          selectable={rest.selectable}
          isSelected={rest.selectedPaths.has(asset.path)}
          onSelectToggle={rest.onSelectToggle}
          onClick={() => rest.onSelect(asset)}
        />
      ))}
    </div>
  )
}

export function AssetGrid({ assets, selectable, selectedPaths, onSelectToggle, onSelect }: AssetGridProps) {
  const groups = groupByFolder(assets)

  if (groups.length <= 1) {
    return (
      <Grid
        items={assets}
        selectable={selectable}
        selectedPaths={selectedPaths}
        onSelectToggle={onSelectToggle}
        onSelect={onSelect}
      />
    )
  }

  return (
    <div>
      {groups.map(({ folder, items }) => (
        <SectionBlock key={folder || '/'} title={folder || '/'} description={`${items.length} items`} defaultOpen={items.length <= 200}>
          <Grid
            items={items}
            folder={folder}
            selectable={selectable}
            selectedPaths={selectedPaths}
            onSelectToggle={onSelectToggle}
            onSelect={onSelect}
          />
        </SectionBlock>
      ))}
    </div>
  )
}
