<script setup lang="ts">
import type { ClientWebMcpState } from '../composables/client'
import type { InvokeResult, RpcFunctionInfo } from '../connect'
import { resolveWebMcpModelContext } from 'devframe/client'
import { onMounted, onUnmounted, reactive, shallowRef } from 'vue'
import { executeWebMcpTool, invokeClientFunction, listClientFunctions, loadWebMcpState } from '../composables/client'
import { useRefreshProvider } from '../composables/refresh'
import { useRpc } from '../composables/rpc'
import ClientView from './ClientView.vue'

const rpc = useRpc()
const functions = shallowRef<RpcFunctionInfo[] | null>(null)
const webmcp = shallowRef<ClientWebMcpState | null>(null)
const results = reactive<Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>>({})
const pending = reactive<Record<string, boolean>>({})

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  functions.value = listClientFunctions(rpc.value.client)
  webmcp.value = await loadWebMcpState(rpc.value.client)
}

useRefreshProvider(fetchData)
let unsubscribe: (() => void) | undefined
onMounted(() => {
  void fetchData()
  // Client functions register locally at any time; follow the collector.
  unsubscribe = rpc.value?.client.onChanged(() => void fetchData())
})
onUnmounted(() => unsubscribe?.())

async function onInvoke(fn: RpcFunctionInfo, parsedArgs: unknown[]): Promise<void> {
  if (!rpc.value)
    return
  pending[fn.name] = true
  try {
    results[fn.name] = await invokeClientFunction(rpc.value.client, fn.name, parsedArgs)
  }
  finally {
    pending[fn.name] = false
  }
}

async function onInvokeTool(name: string, parsedArgs: Record<string, unknown>): Promise<void> {
  const modelContext = resolveWebMcpModelContext()
  const tool = webmcp.value?.tools.find(t => t.name === name)
  if (!modelContext || !tool)
    return
  const key = `webmcp:${name}`
  pending[key] = true
  try {
    results[key] = await executeWebMcpTool(modelContext, tool, parsedArgs)
  }
  finally {
    pending[key] = false
  }
}
</script>

<template>
  <ClientView
    :functions="functions"
    :webmcp="webmcp"
    :results="results"
    :pending="pending"
    @invoke="onInvoke"
    @invoke-tool="onInvokeTool"
  />
</template>
