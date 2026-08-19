'use client'

import type { CommitDetail } from '@devframes/service-git'
import type { DevframeRpcClient } from 'devframe/client'
import { useCallback } from 'react'
import { useRpcResource } from './use-rpc-resource'
import { CommitDetailsView } from './views/commit-details-view'

export interface CommitDetailsPanelProps {
  hash: string
  onClose?: () => void
}

export function CommitDetailsPanel({ hash, onClose }: CommitDetailsPanelProps) {
  const loader = useCallback(
    (rpc: DevframeRpcClient): Promise<CommitDetail> => rpc.call('devframes:service:git:show', { hash }),
    [hash],
  )
  const { data, loading, error } = useRpcResource<CommitDetail>(loader)

  return <CommitDetailsView data={data} loading={loading} error={error} onClose={onClose} />
}
