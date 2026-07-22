<script setup lang="ts">
import type { DevframeInspectCommandInfo, InvokeResult } from '@devframes/plugin-inspect/client'
import { onMounted, reactive, shallowRef } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { isStatic, useRpc } from '../composables/rpc'
import CommandsView from './CommandsView.vue'

const rpc = useRpc()
const commands = shallowRef<DevframeInspectCommandInfo[] | null>(null)
const results = reactive<Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>>({})
const pending = reactive<Record<string, boolean>>({})

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  commands.value = await rpc.value.call('devframes:plugin:inspect:list-commands')
}

useRefreshProvider(fetchData)
onMounted(fetchData)

async function onExecute(cmd: DevframeInspectCommandInfo, parsedArgs: unknown[]): Promise<void> {
  if (!rpc.value)
    return
  pending[cmd.id] = true
  try {
    results[cmd.id] = await rpc.value.call('devframes:plugin:inspect:execute-command', cmd.id, parsedArgs)
  }
  catch (e) {
    const err = e as Error
    results[cmd.id] = { ok: false, error: { name: err?.name ?? 'Error', message: err?.message ?? String(e) } }
  }
  finally {
    pending[cmd.id] = false
  }
}
</script>

<template>
  <CommandsView
    :commands="commands"
    :is-static="isStatic()"
    :results="results"
    :pending="pending"
    @execute="onExecute"
  />
</template>
