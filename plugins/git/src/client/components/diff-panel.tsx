'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

function patchLineClass(line: string): string {
  if (line.startsWith('@@'))
    return 'text-primary'
  if (line.startsWith('+') && !line.startsWith('+++'))
    return 'text-success'
  if (line.startsWith('-') && !line.startsWith('---'))
    return 'text-destructive'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---'))
    return 'text-muted-foreground font-semibold'
  return 'text-foreground'
}

function PatchViewer({ staged, path }: { staged: boolean, path: string }) {
  const loader = useCallback(
    (rpc: DevframeRpcClient) => rpc.call('git:diff', { staged, path }),
    [staged, path],
  )
  const { data, loading } = useRpcResource(loader)

  if (loading || !data)
    return <Skeleton className="h-40 w-full" />
  if (!data.patch)
    return <p className="text-muted-foreground p-3 text-sm">No textual diff available (binary or unchanged).</p>

  return (
    <ScrollArea className="h-72 w-full">
      <pre className="font-mono text-xs leading-relaxed">
        {data.patch.split('\n').map((line, i) => (
          <div key={i} className={cn('px-3 whitespace-pre', patchLineClass(line))}>{line || ' '}</div>
        ))}
      </pre>
      {data.truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
    </ScrollArea>
  )
}

export function DiffPanel() {
  const [staged, setStaged] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const loader = useCallback(
    (rpc: DevframeRpcClient) => rpc.call('git:diff', { staged }),
    [staged],
  )
  const { data, loading, refresh } = useRpcResource(loader)

  const selectScope = useCallback((value: boolean) => {
    setStaged(value)
    setSelected(null)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="bg-muted inline-flex rounded-lg p-[3px] text-sm">
          {([['Working tree', false], ['Staged', true]] as const).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => selectScope(value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 font-medium transition-colors',
                staged === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {data?.isRepo && (
            <span className="text-xs">
              <span className="text-success">
                +
                {data.totalAdditions}
              </span>
              {' '}
              <span className="text-destructive">
                −
                {data.totalDeletions}
              </span>
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} aria-label="Refresh diff">
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.files.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No
          {staged ? ' staged' : ' unstaged'}
          {' '}
          changes.
        </p>
      )}

      {data?.isRepo && data.files.length > 0 && (
        <>
          <ScrollArea className="h-40 pr-3">
            <ul>
              {data.files.map(file => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => setSelected(file.path)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left font-mono text-xs',
                      selected === file.path ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex-1 truncate">{file.path}</span>
                    {file.binary
                      ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">bin</Badge>
                      : (
                          <span className="shrink-0">
                            <span className="text-success">
                              +
                              {file.additions}
                            </span>
                            {' '}
                            <span className="text-destructive">
                              −
                              {file.deletions}
                            </span>
                          </span>
                        )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          {selected && (
            <div className="overflow-hidden rounded-md border">
              <div className="bg-muted/50 border-b px-3 py-1 font-mono text-xs">{selected}</div>
              <PatchViewer key={`${staged}:${selected}`} staged={staged} path={selected} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
