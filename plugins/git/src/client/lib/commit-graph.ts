// Lane-assignment for a commit graph, à la SourceTree / GitHub Desktop.
// Commits are processed top-to-bottom (newest first, --topo-order); lanes
// track the next commit each column is heading toward. Columns are stable
// (no compaction), so vertical lines stay put and branches/merges read clearly.

export interface GraphInput {
  hash: string
  parents: string[]
}

export interface GraphLink {
  /** Column at the top of the half. */
  from: number
  /** Column at the bottom of the half. */
  to: number
  color: string
}

export interface GraphRow {
  /** Column of this commit's node. */
  col: number
  /** Node color. */
  color: string
  /** Connectors in the top half (row top → node center). */
  topLinks: GraphLink[]
  /** Connectors in the bottom half (node center → row bottom). */
  bottomLinks: GraphLink[]
}

export interface CommitGraph {
  rows: GraphRow[]
  /** Total columns spanned, for sizing the gutter. */
  columns: number
}

// Lane palette tuned to read clearly in both themes: a blue leads (the mainline
// / current branch tends to land in lane 0), then warm tones — orange, red —
// pick up branches as they fan out, so adjacent lanes stay distinct.
export const GRAPH_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber / orange
  '#ef4444', // red
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

interface Lane {
  hash: string
  color: string
}

export function computeGraph(commits: GraphInput[]): CommitGraph {
  const lanes: (Lane | null)[] = []
  let colorIndex = 0
  const nextColor = () => GRAPH_COLORS[colorIndex++ % GRAPH_COLORS.length]
  const firstFree = () => {
    const i = lanes.indexOf(null)
    return i === -1 ? lanes.length : i
  }

  const rows: GraphRow[] = []

  for (const commit of commits) {
    const { hash } = commit
    const parents = commit.parents

    // Snapshot lanes entering this row from above.
    const incoming: { col: number, hash: string, color: string }[] = []
    for (let k = 0; k < lanes.length; k++) {
      const lane = lanes[k]
      if (lane)
        incoming.push({ col: k, hash: lane.hash, color: lane.color })
    }

    // The node's column: an existing lane targeting it, else a fresh lane.
    let col = lanes.findIndex(l => l?.hash === hash)
    let color: string
    if (col === -1) {
      col = firstFree()
      color = nextColor()
    }
    else {
      color = lanes[col]!.color
    }

    // Every lane targeting this commit converges into the node.
    for (let k = 0; k < lanes.length; k++) {
      if (lanes[k]?.hash === hash)
        lanes[k] = null
    }
    lanes[col] = null

    // Route the node down to its parents.
    const parentCols: { col: number, color: string }[] = []
    parents.forEach((parent, index) => {
      if (index === 0) {
        lanes[col] = { hash: parent, color }
        parentCols.push({ col, color })
        return
      }
      let pc = lanes.findIndex(l => l?.hash === parent)
      if (pc === -1) {
        pc = firstFree()
        lanes[pc] = { hash: parent, color: nextColor() }
      }
      parentCols.push({ col: pc, color: lanes[pc]!.color })
    })
    if (parents.length === 0)
      lanes[col] = null

    // Drop trailing empty lanes to keep the gutter tight.
    while (lanes.length > 0 && lanes[lanes.length - 1] == null)
      lanes.pop()

    const topLinks: GraphLink[] = incoming.map(lane => ({
      from: lane.col,
      to: lane.hash === hash ? col : lane.col,
      color: lane.color,
    }))

    const bottomLinks: GraphLink[] = []
    for (const lane of incoming) {
      if (lane.hash !== hash)
        bottomLinks.push({ from: lane.col, to: lane.col, color: lane.color })
    }
    for (const parent of parentCols)
      bottomLinks.push({ from: col, to: parent.col, color: parent.color })

    rows.push({ col, color, topLinks, bottomLinks })
  }

  let columns = 0
  for (const row of rows) {
    columns = Math.max(columns, row.col + 1)
    for (const link of row.topLinks)
      columns = Math.max(columns, link.from + 1, link.to + 1)
    for (const link of row.bottomLinks)
      columns = Math.max(columns, link.from + 1, link.to + 1)
  }

  return { rows, columns }
}
