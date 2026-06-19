<script setup lang="ts">
import type { InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { onMounted, reactive, shallowRef } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { isStatic, useRpc } from '../composables/rpc'
import FunctionsView from './FunctionsView.vue'

const rpc = useRpc()
const functions = shallowRef<RpcFunctionInfo[] | null>(null)
const results = reactive<Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>>({})
const pending = reactive<Record<string, boolean>>({})

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  functions.value = await rpc.value.call('devframes-plugin-inspect:list-functions')
}

useRefreshProvider(fetchData)
onMounted(fetchData)

async function onInvoke(fn: RpcFunctionInfo, parsedArgs: unknown[]): Promise<void> {
  if (!rpc.value)
    return
  pending[fn.name] = true
  try {
    results[fn.name] = await rpc.value.call('devframes-plugin-inspect:invoke', fn.name, parsedArgs)
  }
  catch (e) {
    const err = e as Error
    results[fn.name] = { ok: false, error: { name: err?.name ?? 'Error', message: err?.message ?? String(e) } }
  }
  finally {
    pending[fn.name] = false
  }
}
</script>

<template>
  <FunctionsView
    :functions="functions"
    :is-static="isStatic()"
    :results="results"
    :pending="pending"
    @invoke="onInvoke"
  />
</template>
