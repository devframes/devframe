<script setup lang="ts">
import type { AgentManifest, InvokeResult } from '@devframes/plugin-inspect/client'
import { onMounted, reactive, shallowRef } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { isStatic, useRpc } from '../composables/rpc'
import AgentView from './AgentView.vue'

const rpc = useRpc()
const manifest = shallowRef<AgentManifest | null>(null)
const results = reactive<Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>>({})
const pending = reactive<Record<string, boolean>>({})

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  manifest.value = await rpc.value.call('devframes:plugin:inspect:describe-agent')
}

useRefreshProvider(fetchData)
onMounted(fetchData)

async function runAction(id: string, call: (rpc: NonNullable<typeof rpc.value>) => Promise<InvokeResult>) {
  const client = rpc.value
  if (!client)
    return
  pending[id] = true
  try {
    results[id] = await call(client)
  }
  catch (e) {
    const err = e as Error
    results[id] = { ok: false, error: { name: err?.name ?? 'Error', message: err?.message ?? String(e) } }
  }
  finally {
    pending[id] = false
  }
}

function onInvoke(id: string, parsedArgs: unknown) {
  return runAction(id, client => client.call('devframes:plugin:inspect:invoke-agent-tool', id, parsedArgs))
}

function onRead(id: string) {
  return runAction(id, client => client.call('devframes:plugin:inspect:read-agent-resource', id))
}
</script>

<template>
  <AgentView
    :manifest="manifest"
    :is-static="isStatic()"
    :results="results"
    :pending="pending"
    @invoke="onInvoke"
    @read="onRead"
  />
</template>
