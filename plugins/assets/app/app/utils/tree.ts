import type { AssetInfo } from '@devframes/plugin-assets/client-script'
import { folderOf } from './format'

export interface FolderGroup {
  folder: string
  items: AssetInfo[]
}

/** Groups a flat asset list by immediate parent folder, sorted by folder name. */
export function groupByFolder(assets: readonly AssetInfo[]): FolderGroup[] {
  const map = new Map<string, AssetInfo[]>()
  for (const asset of assets) {
    const folder = folderOf(asset.path)
    const list = map.get(folder)
    if (list)
      list.push(asset)
    else
      map.set(folder, [asset])
  }
  return Array.from(map.entries())
    .map(([folder, items]) => ({ folder, items }))
    .sort((a, b) => a.folder.localeCompare(b.folder))
}

export interface TreeNode {
  name: string
  /** Full path from the managed root: a folder path for folders, `asset.path` for files. */
  path: string
  isFolder: boolean
  asset?: AssetInfo
  children: TreeNode[]
}

/** Builds a nested folder/file tree from a flat asset list (folders first, then alphabetical). */
export function buildTree(assets: readonly AssetInfo[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }

  for (const asset of assets) {
    const parts = asset.path.split('/').filter(Boolean)
    let node = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const isLast = i === parts.length - 1
      let child = node.children.find(c => c.name === part && c.isFolder === !isLast)
      if (!child) {
        child = { name: part, path: acc, isFolder: !isLast, children: [], asset: isLast ? asset : undefined }
        node.children.push(child)
      }
      node = child
    })
  }

  const sortNode = (node: TreeNode): void => {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder)
        return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)

  return root.children
}
