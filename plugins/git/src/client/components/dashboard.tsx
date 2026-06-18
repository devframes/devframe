'use client'

import { FileDiff, GitBranch, GitCommitHorizontal, GitGraph, ListTree } from 'lucide-react'
import { BranchesPanel } from './branches-panel'
import { DiffPanel } from './diff-panel'
import { LogPanel } from './log-panel'
import { RpcProvider, useRpc } from './rpc-provider'
import { StatusPanel } from './status-panel'
import { Badge } from './ui/badge'
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

export function Dashboard() {
  return (
    <RpcProvider>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitGraph className="text-primary size-6" />
            <div>
              <h1 className="text-lg leading-none font-semibold">Git Dashboard</h1>
              <p className="text-muted-foreground text-xs">
                devframe + Next.js · type-safe RPC into the host repository
              </p>
            </div>
          </div>
          <ConnectionBadge />
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

          <Card className="mt-2">
            <CardContent>
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
