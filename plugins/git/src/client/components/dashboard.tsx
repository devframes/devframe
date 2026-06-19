'use client'

import { FileDiff, GitBranch, GitCommitHorizontal, GitGraph, ListTree, Moon, Sun } from 'lucide-react'
import { BranchesPanel } from './branches-panel'
import { DiffPanel } from './diff-panel'
import { LogPanel } from './log-panel'
import { RpcProvider, useRpc } from './rpc-provider'
import { StatusPanel } from './status-panel'
import { useTheme } from './theme'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

function ConnectionBadge() {
  const { rpc, error } = useRpc()
  if (error)
    return <Badge variant="destructive">disconnected</Badge>
  if (!rpc)
    return <Badge variant="secondary">connecting…</Badge>
  const backend = rpc.connectionMeta.backend
  return (
    <Badge variant={backend === 'websocket' ? 'success' : 'secondary'} className="font-mono">
      {backend === 'websocket' ? 'live' : 'static'}
    </Badge>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={toggle} aria-label="Toggle light/dark theme">
      {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
    </Button>
  )
}

export function Dashboard() {
  return (
    <RpcProvider>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitGraph className="text-primary size-6" />
            <div>
              <h1 className="text-base leading-none font-semibold">Git Dashboard</h1>
              <p className="text-muted-foreground text-[11px]">
                devframe + Next.js · type-safe RPC into the host repository
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge />
            <ThemeToggle />
          </div>
        </header>

        <Tabs defaultValue="status">
          <TabsList className="w-full">
            <TabsTrigger value="status">
              <ListTree className="size-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="commits">
              <GitCommitHorizontal className="size-4" />
              Commits
            </TabsTrigger>
            <TabsTrigger value="branches">
              <GitBranch className="size-4" />
              Branches
            </TabsTrigger>
            <TabsTrigger value="diff">
              <FileDiff className="size-4" />
              Diff
            </TabsTrigger>
          </TabsList>

          <Card className="mt-1">
            <CardContent className="px-4">
              <TabsContent value="status"><StatusPanel /></TabsContent>
              <TabsContent value="commits"><LogPanel /></TabsContent>
              <TabsContent value="branches"><BranchesPanel /></TabsContent>
              <TabsContent value="diff"><DiffPanel /></TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </main>
    </RpcProvider>
  )
}
